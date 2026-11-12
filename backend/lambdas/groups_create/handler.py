"""POST /groups/create {name, season, replay?}: write the group's META and the caller as its owner.

A replay group plays 2026 again on a virtual clock that starts before the Week 1 lock (F5).
"""

import os
import secrets
from datetime import datetime, timezone
from typing import Annotated

import boto3
from pydantic import Field, StringConstraints

from lambdas.common import nfl_store
from lambdas.common.api import ApiError, Request, api_handler, parse_body, respond, user
from lambdas.common.groups import REPLAY_SEASON, group_summary, member_item, replay_start

dynamodb = boto3.resource("dynamodb")


class CreateGroup(Request):
    name: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=60)]
    season: Annotated[int, Field(ge=2026, le=2100)]
    replay: bool = False


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
    if body.replay:
        if body.season != REPLAY_SEASON:
            raise ApiError(400, f"Only {REPLAY_SEASON} can be replayed")
        lock_ats = nfl_store.replay_lock_ats(body.season)
        if 1 not in lock_ats:
            raise ApiError(409, f"The {REPLAY_SEASON} replay data hasn't been loaded")
        group |= {"replay": True, "clock": replay_start(lock_ats[1])}
    owner = member_item(group, me["sub"], me["name"], "owner", "season")
    table = os.environ["APP_TABLE"]
    dynamodb.meta.client.transact_write_items(
        TransactItems=[
            {"Put": {"TableName": table, "Item": group, "ConditionExpression": "attribute_not_exists(PK)"}},
            {"Put": {"TableName": table, "Item": owner}},
        ]
    )
    return respond(201, group_summary(owner))
