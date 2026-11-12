"""POST /groups/create {name, season}: write the group's META and the caller as its owner."""

import os
import secrets
from datetime import datetime, timezone
from typing import Annotated

import boto3
from pydantic import Field, StringConstraints

from lambdas.common.api import Request, api_handler, parse_body, respond, user
from lambdas.common.groups import group_summary, member_item

dynamodb = boto3.resource("dynamodb")


class CreateGroup(Request):
    name: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=60)]
    season: Annotated[int, Field(ge=2026, le=2100)]


@api_handler("groups_create")
def handler(event, context):
    me = user(event)
    body = parse_body(event, CreateGroup)
    gid = secrets.token_hex(6)
    group = {
        "PK": f"GROUP#{gid}",
        "SK": "META",
        "groupId": gid,
        "name": body.name,
        "season": body.season,
        "ownerSub": me["sub"],
        "createdAt": datetime.now(timezone.utc).isoformat(),
    }
    owner = member_item(group, me["sub"], me["name"], "owner")
    table = os.environ["APP_TABLE"]
    dynamodb.meta.client.transact_write_items(
        TransactItems=[
            {"Put": {"TableName": table, "Item": group, "ConditionExpression": "attribute_not_exists(PK)"}},
            {"Put": {"TableName": table, "Item": owner}},
        ]
    )
    return respond(201, group_summary(owner))
