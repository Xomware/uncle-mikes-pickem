"""POST /replay/advance {groupId, to}: move a replay group's virtual clock. Owner or admin only.

Going backwards is allowed: a replay is a test harness, and re-running a week is the point.
"""

import os
from datetime import timezone
from typing import Annotated

import boto3
from pydantic import AwareDatetime, StringConstraints

from lambdas.common import nfl_store
from lambdas.common.api import ApiError, Request, api_handler, parse_body, respond, user
from lambdas.common.groups import membership, require_organizer

dynamodb = boto3.resource("dynamodb")


class Advance(Request):
    groupId: Annotated[str, StringConstraints(min_length=1, max_length=64)]
    to: AwareDatetime


@api_handler("replay_advance")
def handler(event, context):
    me = user(event)
    body = parse_body(event, Advance)
    table = dynamodb.Table(os.environ["APP_TABLE"])
    require_organizer(membership(table, body.groupId, me["sub"]))

    clock = nfl_store.iso(body.to.astimezone(timezone.utc))
    try:
        table.update_item(
            Key={"PK": f"GROUP#{body.groupId}", "SK": "META"},
            UpdateExpression="SET #c = :c",
            # A live group's clock is real time; setting one would freeze it.
            ConditionExpression="replay = :t",
            ExpressionAttributeNames={"#c": "clock"},
            ExpressionAttributeValues={":c": clock, ":t": True},
        )
    except table.meta.client.exceptions.ConditionalCheckFailedException:
        raise ApiError(409, "Only a replay group has a clock to move")
    return respond(200, {"groupId": body.groupId, "clock": clock})
