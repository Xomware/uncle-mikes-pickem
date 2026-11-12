import re
from datetime import datetime, timezone
from email import message_from_bytes, policy
from pathlib import Path

import boto3
import pytest
from botocore.exceptions import ClientError
from moto import mock_aws

from tests.conftest import create_table

NOW = datetime(2027, 10, 5, 12, tzinfo=timezone.utc)
CTX = {"name": "Pat", "group_name": "Sunday Crew"}
MEMBER = {"PK": "GROUP#g1", "SK": "MEMBER#u-pat", "sub": "u-pat", "role": "member"}
REPO = Path(__file__).resolve().parents[2]
TEMPLATES = REPO / "backend/lambdas/common/email_templates"


@pytest.fixture
def mail(monkeypatch):
    """mailer against moto pickem-ops, SSM and SES. Yields (mailer, parsed sent messages)."""
    monkeypatch.setenv("OPS_TABLE", "ops")
    monkeypatch.setenv("UNSUBSCRIBE_PARAM", "/pickem/email-unsubscribe-secret")
    monkeypatch.setenv("API_URL", "https://api.pickem.xomware.com")
    monkeypatch.setenv("SITE_URL", "https://pickem.xomware.com")
    monkeypatch.setenv("EMAIL_SENDER", "noreply@pickem.xomware.com")
    monkeypatch.setenv("EMAIL_CONFIG_SET", "pickem-mail")
    with mock_aws():
        create_table("ops")
        boto3.client("ssm").put_parameter(
            Name="/pickem/email-unsubscribe-secret", Value="k" * 64, Type="SecureString"
        )
        ses = boto3.client("sesv2")
        ses.create_email_identity(EmailIdentity="pickem.xomware.com")
        ses.create_configuration_set(ConfigurationSetName="pickem-mail")
        from lambdas.common import mailer, suppression, unsubscribe

        unsubscribe._secret.cache_clear()
        monkeypatch.setattr(mailer, "dynamodb", boto3.resource("dynamodb"))
        monkeypatch.setattr(suppression, "dynamodb", boto3.resource("dynamodb"))
        sent = []

        class Spy:
            """Forwards to moto and keeps each raw message, parsed."""

            def send_email(self, **kwargs):
                sent.append(message_from_bytes(kwargs["Content"]["Raw"]["Data"], policy=policy.default))
                return ses.send_email(**kwargs)

        monkeypatch.setattr(mailer, "_ses", lambda: Spy())
        yield mailer, sent


def deliver(mailer, member=MEMBER, event="test#1"):
    return mailer.deliver(member, "pat@example.com", "results", "test", event, CTX, NOW)


def test_renders_html_and_text_with_footer_unsubscribe(mail):
    mailer, _ = mail
    email = mailer.render("test", CTX, "https://api.test/email/unsubscribe?token=abc")

    assert email.subject == "Test email from Uncle Mike's NFL Pick Em"
    assert "Hi Pat" in email.html and "Sunday Crew" in email.html
    assert 'href="https://api.test/email/unsubscribe?token=abc"' in email.html
    assert "Unsubscribe: https://api.test/email/unsubscribe?token=abc" in email.text
    assert "<" not in email.text


def test_layout_carries_the_brand_header_and_payments_footer(mail):
    mailer, _ = mail
    email = mailer.render("test", CTX, "u")

    assert '<img src="https://pickem.xomware.com/brand/email-header.png"' in email.html
    assert "alt=\"Uncle Mike's NFL Pick Em\"" in email.html
    assert "Payments go directly to your organizer." in email.html
    assert "Payments go directly to your organizer." in email.text


def test_every_template_extends_base():
    for path in TEMPLATES.iterdir():
        if path.stem != "base":
            assert path.read_text().startswith(f'{{% extends "base{path.suffix}" %}}'), path.name


def test_brand_colors_match_the_site_and_brand_files_exist():
    from lambdas.common.mailer import COLORS

    css = (REPO / "frontend/app/globals.css").read_text()
    site = dict(re.findall(r"--brand-([a-z]+): (#[0-9a-f]{6});", css))
    assert site and site == {k: COLORS[k] for k in site}

    for name in re.findall(r"/brand/([\w.-]+)", (TEMPLATES / "base.html").read_text()):
        assert (REPO / "frontend/public/brand" / name).is_file(), name


def test_html_escapes_context(mail):
    mailer, _ = mail
    email = mailer.render("test", {**CTX, "name": "<b>Pat</b>"}, "u")
    assert "&lt;b&gt;Pat" in email.html
    assert "<b>Pat</b>" in email.text


def test_missing_context_fails_loudly(mail):
    mailer, _ = mail
    with pytest.raises(Exception, match="group_name"):
        mailer.render("test", {"name": "Pat"}, "u")


def test_sends_once_per_event(mail):
    mailer, sent = mail
    assert deliver(mailer) == "sent"
    assert deliver(mailer) == "dup"
    assert deliver(mailer, event="test#2") == "sent"
    assert len(sent) == 2


def test_message_carries_both_parts_and_one_click_unsubscribe(mail):
    mailer, sent = mail
    from lambdas.common.unsubscribe import verify

    deliver(mailer)
    msg = sent[0]
    assert msg["To"] == "pat@example.com"
    assert msg["From"] == "Uncle Mike's NFL Pick Em <noreply@pickem.xomware.com>"
    assert msg["List-Unsubscribe-Post"] == "List-Unsubscribe=One-Click"
    assert verify(msg["List-Unsubscribe"].split("token=")[1].rstrip(">")) == ("u-pat", "g1", "all")
    assert [p.get_content_type() for p in msg.walk()][1:] == ["text/plain", "text/html"]
    footer = msg.get_body(("html",)).get_content().split('href="https://api.pickem.xomware.com/email/unsubscribe?token=')[1]
    assert verify(footer.split('"')[0]) == ("u-pat", "g1", "results")


def test_respects_prefs(mail):
    mailer, sent = mail
    assert deliver(mailer, {**MEMBER, "emailPrefs": {"results": False}}) == "off"
    assert sent == []


def test_skips_suppressed_addresses(mail):
    mailer, sent = mail
    from lambdas.common.suppression import suppress

    suppress("Pat@Example.com", "bounce")
    assert deliver(mailer) == "suppressed"
    assert sent == []


def test_failed_send_releases_the_claim_for_a_retry(mail, monkeypatch):
    mailer, sent = mail

    def reject(*args):
        raise ClientError({"Error": {"Code": "MessageRejected", "Message": "no"}}, "SendEmail")

    with monkeypatch.context() as m:
        m.setattr(mailer, "send", reject)
        assert deliver(mailer) == "failed"
    assert deliver(mailer) == "sent"
