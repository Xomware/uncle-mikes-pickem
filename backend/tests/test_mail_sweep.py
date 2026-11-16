import importlib
from datetime import datetime, timedelta, timezone
from email import message_from_bytes, policy

import boto3
import pytest

from lambdas.common import results
from tests.test_results import db, finish, group  # noqa: F401  (db is a fixture)

OPS = "ops"


@pytest.fixture
def sweep(db, monkeypatch):
    """The mail_sweep module over test_results' week-1 group, with SES and SSM mocked. Yields (module, sent)."""
    for name, value in {
        "UNSUBSCRIBE_PARAM": "/pickem/email-unsubscribe-secret",
        "API_URL": "https://api.pickem.xomware.com",
        "SITE_URL": "https://pickem.xomware.com",
        "EMAIL_SENDER": "noreply@pickem.xomware.com",
        "EMAIL_CONFIG_SET": "pickem-mail",
    }.items():
        monkeypatch.setenv(name, value)
    boto3.client("ssm").put_parameter(Name="/pickem/email-unsubscribe-secret", Value="k" * 64, Type="SecureString")
    ses = boto3.client("sesv2")
    ses.create_email_identity(EmailIdentity="pickem.xomware.com")
    ses.create_configuration_set(ConfigurationSetName="pickem-mail")
    from lambdas.common import mailer, suppression, unsubscribe

    unsubscribe._secret.cache_clear()
    for module in (mailer, suppression):
        monkeypatch.setattr(module, "dynamodb", boto3.resource("dynamodb"))
    sent = []

    class Spy:
        def send_email(self, **kwargs):
            sent.append(message_from_bytes(kwargs["Content"]["Raw"]["Data"], policy=policy.default))
            return ses.send_email(**kwargs)

    monkeypatch.setattr(mailer, "_ses", lambda: Spy())
    for sub in ("a", "b"):
        db.update_item(Key={"PK": "GROUP#g", "SK": f"MEMBER#{sub}"}, UpdateExpression="SET groupName = :n",
                       ExpressionAttributeValues={":n": "Sunday Crew"})
        db.put_item(Item={"PK": f"USER#{sub}", "SK": "PROFILE", "email": f"{sub}@example.com"})
    module = importlib.import_module("lambdas.mail_sweep.handler")
    monkeypatch.setattr(module, "dynamodb", boto3.resource("dynamodb"))
    return module, sent


def by_to(sent):
    return {m["To"]: m for m in sent}


def confirm_week(db):
    finish("100", 10, 20)
    finish("101", 14, 21)
    results.regrade(db, group(db))


def test_week_confirmed_mails_every_member_once(sweep, db):
    module, sent = sweep
    confirm_week(db)
    assert module.handler({}, None) == {"sent": 2}

    mail = by_to(sent)
    # a: H0 right at 2 + H1 right at 1 = 3, and the tiebreak 30 beats b's 40 on a 35 total.
    assert mail["a@example.com"]["Subject"] == "You won Week 1"
    assert mail["b@example.com"]["Subject"] == "Week 1 results: 2 points, 2nd"
    text = mail["b@example.com"].get_body(("plain",)).get_content()
    assert "Winner: A with 3 points." in text
    assert "A0 @ H0" in text and "GOW" in text
    assert "1st of 2 with" not in text and "2nd of 2 with 1 points (-1 GOW)." in text

    assert module.handler({}, None) == {"dup": 2}  # the overlap window re-reads it
    assert len(sent) == 2


def test_rerun_after_cursor_loss_dedupes_through_claims(sweep, db):
    module, sent = sweep
    confirm_week(db)
    module.handler({}, None)
    boto3.resource("dynamodb").Table(OPS).delete_item(Key=module.CURSOR)
    assert module.handler({}, None) == {"dup": 2}
    assert len(sent) == 2


def test_results_pref_off_skips_the_member(sweep, db):
    module, sent = sweep
    db.update_item(Key={"PK": "GROUP#g", "SK": "MEMBER#b"}, UpdateExpression="SET emailPrefs = :p",
                   ExpressionAttributeValues={":p": {"results": False}})
    confirm_week(db)
    assert module.handler({}, None) == {"sent": 1, "off": 1}
    assert list(by_to(sent)) == ["a@example.com"]


def test_member_without_a_profile_is_counted_not_mailed(sweep, db):
    module, sent = sweep
    db.delete_item(Key={"PK": "USER#b", "SK": "PROFILE"})
    confirm_week(db)
    assert module.handler({}, None) == {"sent": 1, "noaddress": 1}


def test_superseded_announcement_is_skipped(sweep, db):
    module, sent = sweep
    confirm_week(db)
    # An override flips the winner before the sweep reads result#W01: only #v2 goes out.
    db.put_item(Item={"PK": "GROUP#g#S2027#W01", "SK": "OVERRIDE#100", "awayScore": 30, "homeScore": 0})
    results.regrade(db, group(db))
    assert module.handler({}, None) == {"sent": 2}
    assert by_to(sent)["b@example.com"]["Subject"] == "You won Week 1"


def entry(db, entry_id, owner, picks):
    db.put_item(Item={"PK": "GROUP#g#S2027", "SK": f"DEATH#{entry_id}", "entryId": entry_id, "ownerSub": owner,
                      "label": f"{owner.upper()} {entry_id}", "picks": picks})


def death_mail(sent):
    return [(m["To"], m["Subject"]) for m in sent if not m["Subject"].startswith(("You won Week", "Week 1 results"))]


def test_elimination_mails_the_owner_in_sudden_death(sweep, db):
    module, sent = sweep
    entry(db, "x", "b", {"1": "A0"})
    entry(db, "y", "b", {})
    entry(db, "z", "a", {"1": "H1"})
    confirm_week(db)
    module.handler({}, None)
    assert sorted(death_mail(sent)) == [("b@example.com", "B x is eliminated"), ("b@example.com", "B y is eliminated")]
    out = {m["Subject"]: m.get_body(("plain",)).get_content() for m in sent}
    assert out["B x is eliminated"].startswith("OVERTIME / SUDDEN DEATH")
    assert "Week 1: A0 lost" in out["B x is eliminated"]
    assert "no pick. A missed pick ends the run." in out["B y is eliminated"]
    assert "1 entry is still alive." in out["B y is eliminated"]


def test_life_lost_mails_the_owner(sweep, db):
    module, sent = sweep
    db.put_item(Item={"PK": "GROUP#g", "SK": "RULES#S2027#v1", "version": 1, "effectiveWeek": 1, "deathSecondLife": True})
    entry(db, "x", "b", {"1": "A0"})
    entry(db, "z", "a", {"1": "H1"})
    confirm_week(db)
    module.handler({}, None)
    assert death_mail(sent) == [("b@example.com", "B x lost a life")]


def test_revive_mails_each_owner_once(sweep, db):
    module, sent = sweep
    entry(db, "x", "a", {"1": "A0"})
    entry(db, "y", "b", {"1": "A1"})
    entry(db, "w", "b", {"1": "A0"})
    confirm_week(db)
    module.handler({}, None)
    subject = "Replay the down: everyone's back in Week 1"
    assert sorted(death_mail(sent)) == [("a@example.com", subject), ("b@example.com", subject)]
    assert "B w, B y" in by_to([m for m in sent if m["Subject"] == subject])["b@example.com"].get_body(("plain",)).get_content()


def test_an_elimination_undone_before_the_sweep_is_not_sent(sweep, db):
    module, sent = sweep
    entry(db, "x", "b", {"1": "A0"})
    entry(db, "z", "a", {"1": "H1"})
    confirm_week(db)
    db.put_item(Item={"PK": "GROUP#g#S2027#W01", "SK": "OVERRIDE#100", "awayScore": 30, "homeScore": 0})
    results.regrade(db, group(db))
    module.handler({}, None)
    assert death_mail(sent) == []


def set_clock(db, at):
    db.update_item(Key={"PK": "GROUP#g", "SK": "META"}, UpdateExpression="SET clock = :c",
                   ExpressionAttributeValues={":c": at})


@pytest.mark.parametrize("left,due", [
    (timedelta(hours=25), None), (timedelta(hours=24), 24), (timedelta(hours=3), 24),
    (timedelta(hours=2), 2), (timedelta(minutes=1), 2), (timedelta(0), None),
])
def test_reminder_windows(sweep, left, due):
    module, _ = sweep
    lock = datetime(2027, 9, 10, 0, 20, tzinfo=timezone.utc)
    assert module.reminder_due(lock - left, lock) == due


def test_reminders_go_to_incomplete_sheets_and_unpicked_death_entries(sweep, db):
    module, sent = sweep
    # Lock is Thu 2027-09-10 00:20Z; a's sheet is complete, b's is a draft.
    db.update_item(Key={"PK": "GROUP#g#S2027#W01", "SK": "PICK#b"}, UpdateExpression="SET complete = :f",
                   ExpressionAttributeValues={":f": False})
    entry(db, "x", "a", {})
    entry(db, "y", "b", {"1": "KC"})
    set_clock(db, "2027-09-09T12:00:00Z")
    assert module.handler({}, None) == {"sent": 2}
    mail = by_to(sent)
    assert mail["a@example.com"]["Subject"] == "Week 1 locks Thu 8:20 PM ET"
    a = mail["a@example.com"].get_body(("plain",)).get_content()
    assert "A x has no Week 1 pick. A missed pick eliminates it." in a and "PICK EM:" not in a
    assert "your sheet is saved but not complete" in mail["b@example.com"].get_body(("plain",)).get_content()
    assert module.handler({}, None) == {"dup": 2}

    set_clock(db, "2027-09-09T23:00:00Z")
    assert module.handler({}, None) == {"sent": 2}
    assert sent[-1]["Subject"].startswith("Last call: Week 1 locks")


def test_no_reminder_outside_the_window_or_when_turned_off(sweep, db):
    module, sent = sweep
    db.delete_item(Key={"PK": "GROUP#g#S2027#W01", "SK": "PICK#b"})
    set_clock(db, "2027-09-08T00:00:00Z")
    assert module.handler({}, None) == {}
    db.update_item(Key={"PK": "GROUP#g", "SK": "MEMBER#b"}, UpdateExpression="SET emailPrefs = :p",
                   ExpressionAttributeValues={":p": {"reminders": False}})
    set_clock(db, "2027-09-09T12:00:00Z")
    assert module.handler({}, None) == {"off": 1}
    assert sent == []
