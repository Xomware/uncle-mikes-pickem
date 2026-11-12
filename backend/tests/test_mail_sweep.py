import importlib
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
