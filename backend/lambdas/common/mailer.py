"""Renders and sends one email to one member through SES v2, at most once per event (BRAINSTORM.md 3A).

The claim log is `MAIL#<sub>#<groupId>#<eventId>` in pickem-ops, and the
conditional put is the claim, so a regrade, a replay or two overlapping ticks
can't send twice. A failed send flips its row to `failed`, which the next run
may claim again. A crash between claim and send loses that one email rather
than risking a double. A regrade that changes the outcome sends under a new
event id (`result#W05#v2`), not this one.

Templates are Jinja2 in email_templates/: `<name>.html` and `<name>.txt`, each
extending base. The HTML template sets `subject` at the top level.
"""

import functools
import logging
import os
from datetime import datetime, timedelta
from email import policy
from email.message import EmailMessage
from email.utils import formataddr
from pathlib import Path
from typing import NamedTuple

import boto3
from botocore.exceptions import ClientError
from jinja2 import Environment, FileSystemLoader, StrictUndefined, select_autoescape

from lambdas.common.email_prefs import with_defaults
from lambdas.common.suppression import is_suppressed
from lambdas.common.unsubscribe import link

log = logging.getLogger()

BRAND = "Uncle Mike's NFL Pick Em"
# Longer than a season, so a replay or late regrade still finds the claim.
CLAIM_TTL = timedelta(days=400)
# The default policy folds headers at 78 characters, and a header with no space
# to fold at, like List-Unsubscribe's URL, comes out as RFC 2047 encoded-words
# that mail clients don't read as a URL. 998 is RFC 5322's hard line limit.
SMTP_POLICY = policy.SMTP.clone(max_line_length=998)

dynamodb = boto3.resource("dynamodb")
templates = Environment(
    loader=FileSystemLoader(Path(__file__).parent / "email_templates"),
    autoescape=select_autoescape(["html"]),
    undefined=StrictUndefined,
    trim_blocks=True,
    lstrip_blocks=True,
)


class Email(NamedTuple):
    subject: str
    html: str
    text: str


@functools.cache
def _ses():
    return boto3.client("sesv2")


def render(name: str, ctx: dict, unsubscribe_url: str) -> Email:
    ctx = {**ctx, "brand": BRAND, "site": os.environ["SITE_URL"], "unsubscribe_url": unsubscribe_url}
    html = templates.get_template(f"{name}.html").make_module(ctx)
    return Email(html.subject, str(html), templates.get_template(f"{name}.txt").render(ctx))


def send(address: str, email: Email, unsubscribe_url: str) -> None:
    msg = EmailMessage(policy=SMTP_POLICY)
    msg["From"] = formataddr((BRAND, os.environ["EMAIL_SENDER"]))
    msg["To"] = address
    msg["Subject"] = email.subject
    msg["List-Unsubscribe"] = f"<{unsubscribe_url}>"
    msg["List-Unsubscribe-Post"] = "List-Unsubscribe=One-Click"
    msg.set_content(email.text)
    msg.add_alternative(email.html, subtype="html")
    _ses().send_email(
        Content={"Raw": {"Data": msg.as_bytes()}},
        ConfigurationSetName=os.environ["EMAIL_CONFIG_SET"],
    )


def _key(sub: str, group_id: str, event_id: str) -> dict:
    return {"PK": f"MAIL#{sub}#{group_id}#{event_id}", "SK": "MAIL"}


def claim(sub: str, group_id: str, event_id: str, now: datetime) -> bool:
    try:
        dynamodb.Table(os.environ["OPS_TABLE"]).put_item(
            Item={
                **_key(sub, group_id, event_id),
                "status": "sent",
                "at": now.isoformat(timespec="seconds"),
                "ttl": int((now + CLAIM_TTL).timestamp()),
            },
            ConditionExpression="attribute_not_exists(PK) OR #status = :failed",
            ExpressionAttributeNames={"#status": "status"},
            ExpressionAttributeValues={":failed": "failed"},
        )
    except ClientError as e:
        if e.response["Error"]["Code"] != "ConditionalCheckFailedException":
            raise
        return False
    return True


def _release(sub: str, group_id: str, event_id: str) -> None:
    dynamodb.Table(os.environ["OPS_TABLE"]).update_item(
        Key=_key(sub, group_id, event_id),
        UpdateExpression="SET #status = :failed",
        ExpressionAttributeNames={"#status": "status"},
        ExpressionAttributeValues={":failed": "failed"},
    )


def deliver(member: dict, address: str, kind: str, template: str, event_id: str, ctx: dict, now: datetime) -> str:
    """One member's copy: sent, failed, off (they turned `kind` off), suppressed, or dup (already sent)."""
    if not with_defaults(member.get("emailPrefs"))[kind]:
        return "off"
    if is_suppressed(address):
        return "suppressed"
    sub, group_id = member["sub"], member["PK"].removeprefix("GROUP#")
    # Rendered before the claim, so a template error can't mark an unsent email as sent.
    email = render(template, ctx, link(sub, group_id, kind))
    if not claim(sub, group_id, event_id, now):
        return "dup"
    try:
        send(address, email, link(sub, group_id, "all"))
    except ClientError as e:
        log.error("mail %s to %s failed, retrying next tick: %s", event_id, sub, e.response["Error"]["Code"])
        _release(sub, group_id, event_id)
        return "failed"
    return "sent"
