"""POST /gow/set {groupId, week, gameId}: choose the week's game of the week. Owner or admin, before lock."""

import os
from typing import Annotated

import boto3
from pydantic import Field, StringConstraints

from lambdas.common import clock, gow, nfl_store, weeks
from lambdas.common.api import ApiError, Request, api_handler, parse_body, respond, user
from lambdas.common.groups import require_organizer

dynamodb = boto3.resource("dynamodb")


class SetGow(Request):
    groupId: Annotated[str, StringConstraints(min_length=1, max_length=64)]
    week: Annotated[int, Field(ge=1, le=18)]
    gameId: Annotated[str, StringConstraints(min_length=1, max_length=20)]


@api_handler("gow_set")
def handler(event, context):
    me = user(event)
    body = parse_body(event, SetGow)
    table = dynamodb.Table(os.environ["APP_TABLE"])
    group, member, nfl_week = weeks.load(table, body.groupId, me["sub"], body.week)
    require_organizer(member)
    weeks.require_unlocked(group, nfl_week)
    if body.gameId not in nfl_week["gameIds"]:
        raise ApiError(400, f"That game isn't in Week {body.week}")

    pk = weeks.week_pk(body.groupId, int(group["season"]), body.week)
    if body.gameId in weeks.canceled_ids(table, pk):
        raise ApiError(409, "That game is canceled for this group")
    item = gow.item(pk, body.gameId, me["sub"], nfl_store.iso(clock.now(group)))
    table.put_item(Item=item)
    return respond(200, {"gow": gow.public(item)})
