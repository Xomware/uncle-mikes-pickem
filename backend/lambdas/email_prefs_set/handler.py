"""POST /email/prefs-set {groupId, prefs: {type: bool}}: change some of the caller's email preferences in one group.

A separate path from GET /email/prefs: the API module gives each path one method.
"""

import os
from typing import Annotated

import boto3
from pydantic import StringConstraints

from lambdas.common.api import ApiError, Request, api_handler, parse_body, respond, user
from lambdas.common.email_prefs import with_defaults
from lambdas.common.groups import membership

dynamodb = boto3.resource("dynamodb")


class Prefs(Request):
    results: bool | None = None
    reminders: bool | None = None
    death: bool | None = None
    gowAdmin: bool | None = None


class SetPrefs(Request):
    groupId: Annotated[str, StringConstraints(min_length=1, max_length=64)]
    prefs: Prefs


@api_handler("email_prefs_set")
def handler(event, context):
    me = user(event)
    body = parse_body(event, SetPrefs)
    changes = body.prefs.model_dump(exclude_none=True)
    if not changes:
        raise ApiError(400, "No changes")
    table = dynamodb.Table(os.environ["APP_TABLE"])
    member = membership(table, body.groupId, me["sub"])
    prefs = {**with_defaults(member.get("emailPrefs")), **changes}
    table.update_item(
        Key={"PK": member["PK"], "SK": member["SK"]},
        UpdateExpression="SET emailPrefs = :p",
        ConditionExpression="attribute_exists(PK)",
        ExpressionAttributeValues={":p": prefs},
    )
    return respond(200, {"groupId": body.groupId, "prefs": prefs})
