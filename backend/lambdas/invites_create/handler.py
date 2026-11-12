"""POST /invites/create {groupId}: a new invite code for the group. Owner or admin only."""

import os
import secrets
from datetime import datetime, timedelta, timezone
from typing import Annotated

import boto3
from pydantic import StringConstraints

from lambdas.common.api import Request, api_handler, parse_body, respond, user
from lambdas.common.groups import membership, require_organizer

dynamodb = boto3.resource("dynamodb")

LIFETIME = timedelta(days=30)


class CreateInvite(Request):
    groupId: Annotated[str, StringConstraints(min_length=1, max_length=64)]


@api_handler("invites_create")
def handler(event, context):
    me = user(event)
    body = parse_body(event, CreateInvite)
    table = dynamodb.Table(os.environ["APP_TABLE"])
    require_organizer(membership(table, body.groupId, me["sub"]))

    # 72 random bits: the code is the only thing standing between a stranger and the group.
    code = secrets.token_urlsafe(9)
    now = datetime.now(timezone.utc)
    expires = (now + LIFETIME).isoformat()
    table.put_item(
        Item={
            "PK": f"INVITE#{code}",
            "SK": "META",
            "groupId": body.groupId,
            "createdBy": me["sub"],
            "createdAt": now.isoformat(),
            "expiresAt": expires,
        },
        ConditionExpression="attribute_not_exists(PK)",
    )
    return respond(201, {"code": code, "expiresAt": expires})
