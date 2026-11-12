import base64

import boto3
import pytest
from botocore.exceptions import ClientError

from tests.conftest import DOM, PAT, SAM, call, create_table


@pytest.fixture
def api(app, monkeypatch):
    for name, value in {
        "OPS_TABLE": "ops",
        "UNSUBSCRIBE_PARAM": "/pickem/email-unsubscribe-secret",
        "API_URL": "https://api.pickem.xomware.com",
        "SITE_URL": "https://pickem.xomware.com",
        "EMAIL_SENDER": "noreply@pickem.xomware.com",
        "EMAIL_CONFIG_SET": "pickem-mail",
    }.items():
        monkeypatch.setenv(name, value)
    create_table("ops")
    boto3.client("ssm").put_parameter(Name="/pickem/email-unsubscribe-secret", Value="k" * 64, Type="SecureString")
    ses = boto3.client("sesv2")
    ses.create_email_identity(EmailIdentity="pickem.xomware.com")
    ses.create_configuration_set(ConfigurationSetName="pickem-mail")

    from lambdas.common import mailer, suppression, unsubscribe

    unsubscribe._secret.cache_clear()
    mailer._ses.cache_clear()
    monkeypatch.setattr(suppression, "dynamodb", boto3.resource("dynamodb"))
    names = ("groups_create", "invites_create", "invites_accept")
    names += ("email_prefs", "email_prefs_set", "email_unsubscribe", "email_preview", "email_test")
    return {name: app(name) for name in names}


@pytest.fixture
def gid(api):
    gid = call(api["groups_create"], DOM, {"name": "Sunday Crew", "season": 2027})[1]["groupId"]
    code = call(api["invites_create"], DOM, {"groupId": gid})[1]["code"]
    call(api["invites_accept"], PAT, {"code": code, "entryType": "weekly"})
    return gid


ALL_ON = {"results": True, "reminders": True, "death": True, "gowAdmin": True}


def prefs(api, who, gid):
    return next(g["prefs"] for g in call(api["email_prefs"], who)[1]["groups"] if g["groupId"] == gid)


def test_prefs_default_on_and_update_partially(api, gid):
    status, data = call(api["email_prefs"], PAT)
    assert status == 200
    assert data["address"] == "pat@example.com" and data["suppressed"] is False
    assert set(data["types"]) == set(ALL_ON)
    assert data["groups"] == [{"groupId": gid, "name": "Sunday Crew", "season": 2027, "role": "member", "prefs": ALL_ON}]

    status, data = call(api["email_prefs_set"], PAT, {"groupId": gid, "prefs": {"reminders": False}})
    assert (status, data["prefs"]) == (200, {**ALL_ON, "reminders": False})
    assert prefs(api, PAT, gid) == {**ALL_ON, "reminders": False}
    assert prefs(api, DOM, gid) == ALL_ON


def test_prefs_reports_a_suppressed_address(api, gid):
    from lambdas.common.suppression import suppress

    suppress("pat@example.com", "bounce")
    assert call(api["email_prefs"], PAT)[1]["suppressed"] is True


@pytest.mark.parametrize(
    "body, status",
    [
        ({"prefs": {}}, 400),
        ({"prefs": {"results": "false"}}, 400),
        ({"prefs": {"results": 0}}, 400),
        ({"prefs": {"spam": True}}, 400),
    ],
)
def test_prefs_set_rejects(api, gid, body, status):
    assert call(api["email_prefs_set"], PAT, {"groupId": gid, **body})[0] == status


def test_prefs_set_needs_membership(api, gid):
    assert call(api["email_prefs_set"], SAM, {"groupId": gid, "prefs": {"results": False}})[0] == 404


def unsub(api, method, token, body=None, encode=False):
    event = {"httpMethod": method, "headers": {}, "queryStringParameters": None, "body": body}
    if token is not None:
        event["queryStringParameters"] = {"token": token}
    if encode and body:
        event["body"], event["isBase64Encoded"] = base64.b64encode(body.encode()).decode(), True
    out = api["email_unsubscribe"].handler(event, None)
    assert out["headers"]["Content-Type"].startswith("text/html")
    return out["statusCode"], out["body"]


def test_unsubscribe_get_confirms_without_changing_anything(api, gid):
    from lambdas.common.unsubscribe import make_token

    token = make_token(PAT["sub"], gid, "death")
    status, page = unsub(api, "GET", token)
    assert status == 200 and '<form method="post">' in page and "Death pool" in page
    assert prefs(api, PAT, gid) == ALL_ON


def test_unsubscribe_form_post_turns_off_one_type(api, gid):
    from lambdas.common.unsubscribe import make_token

    token = make_token(PAT["sub"], gid, "death")
    status, page = unsub(api, "POST", None, f"token={token}", encode=True)
    assert (status, "Unsubscribed" in page) == (200, True)
    assert prefs(api, PAT, gid) == {**ALL_ON, "death": False}


def test_one_click_post_turns_off_everything_in_the_group(api, gid):
    from lambdas.common.unsubscribe import make_token

    status, _ = unsub(api, "POST", make_token(PAT["sub"], gid, "all"), "List-Unsubscribe=One-Click")
    assert status == 200
    assert prefs(api, PAT, gid) == dict.fromkeys(ALL_ON, False)


def test_unsubscribe_rejects_bad_tokens_methods_and_former_members(api, gid):
    from lambdas.common.unsubscribe import make_token

    assert unsub(api, "POST", "nope.nope")[0] == 400
    assert unsub(api, "PUT", make_token(PAT["sub"], gid, "all"))[0] == 405
    assert unsub(api, "POST", make_token(SAM["sub"], gid, "all"))[0] == 404


def test_preview_renders_for_organizers_only(api, gid):
    status, data = call(api["email_preview"], DOM, query={"id": gid, "template": "test"})
    assert status == 200
    assert data["subject"] == "Test email from Uncle Mike's NFL Pick Em"
    assert "Hi Dom" in data["html"] and "Sunday Crew" in data["text"]

    assert call(api["email_preview"], PAT, query={"id": gid, "template": "test"})[0] == 403
    status, message = call(api["email_preview"], DOM, query={"id": gid, "template": "nope"})
    assert (status, message) == (400, "template must be one of test")


def test_test_email_goes_to_the_caller(api, gid, monkeypatch):
    from lambdas.common import mailer

    sent = []
    monkeypatch.setattr(mailer, "send", lambda address, email, url: sent.append((address, email.subject)))

    status, data = call(api["email_test"], PAT, {"groupId": gid})
    assert (status, data["to"]) == (200, "pat@example.com")
    assert sent == [("pat@example.com", "Test email from Uncle Mike's NFL Pick Em")]
    assert call(api["email_test"], SAM, {"groupId": gid})[0] == 404


def test_test_email_sends_through_ses(api, gid):
    assert call(api["email_test"], PAT, {"groupId": gid})[0] == 200


def test_test_email_surfaces_an_ses_refusal(api, gid, monkeypatch):
    from lambdas.common import mailer

    def reject(*args):
        raise ClientError({"Error": {"Code": "MessageRejected", "Message": "Email address is not verified."}}, "SendEmail")

    monkeypatch.setattr(mailer, "send", reject)
    status, message = call(api["email_test"], PAT, {"groupId": gid})
    assert (status, message) == (502, "SES refused the send: Email address is not verified.")

