"""GET /email/preview?id=<groupId>&template=<name>: render an email with sample data. Owners and admins only.

The caller's name and the group's name fill in for the recipient; the rest is
SAMPLES. Unsubscribe links are real and act on the caller.
"""

import os

import boto3

from lambdas.common import mailer
from lambdas.common.api import ApiError, api_handler, query_param, respond, user
from lambdas.common.groups import membership, require_organizer
from lambdas.common.unsubscribe import link

dynamodb = boto3.resource("dynamodb")

# Each template's context beyond name and group_name. Results, reminders, death
# and GOW templates add theirs here as they land (F11.3-11.6).
SAMPLES: dict[str, dict] = {"test": {}}


@api_handler("email_preview")
def handler(event, context):
    me = user(event)
    template = query_param(event, "template")
    member = membership(dynamodb.Table(os.environ["APP_TABLE"]), query_param(event, "id"), me["sub"])
    require_organizer(member)
    if template not in SAMPLES:
        raise ApiError(400, f"template must be one of {', '.join(sorted(SAMPLES))}")
    ctx = {**SAMPLES[template], "name": me["name"], "group_name": member["groupName"]}
    email = mailer.render(template, ctx, link(me["sub"], member["PK"].removeprefix("GROUP#"), "all"))
    return respond(200, {"template": template, "subject": email.subject, "html": email.html, "text": email.text})
