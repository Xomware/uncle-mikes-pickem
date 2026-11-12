"""POST /results/override {groupId, week, gameId, awayScore, homeScore}: set a game's final score for the group. Organizer.

Stored as an input (`OVERRIDE#<gameId>`), never an edit to RESULT, then the group regrades.
An override counts as confirmed, so it settles a game nflverse disagrees on. Null scores clear it.
"""

import os
from typing import Annotated

import boto3
from pydantic import Field, StringConstraints

from lambdas.common import nfl_store, results, weeks
from lambdas.common.api import ApiError, Request, api_handler, parse_body, respond, user
from lambdas.common.groups import require_organizer

dynamodb = boto3.resource("dynamodb")

Score = Annotated[int, Field(ge=0, le=200)] | None


class Override(Request):
    groupId: Annotated[str, StringConstraints(min_length=1, max_length=64)]
    week: Annotated[int, Field(ge=1, le=18)]
    gameId: Annotated[str, StringConstraints(min_length=1, max_length=20)]
    awayScore: Score
    homeScore: Score


@api_handler("results_override")
def handler(event, context):
    me = user(event)
    body = parse_body(event, Override)
    table = dynamodb.Table(os.environ["APP_TABLE"])
    group, member, feed, nfl_week = weeks.load(table, body.groupId, me["sub"], body.week)
    require_organizer(member)
    if not feed.locked(nfl_week):
        raise ApiError(409, f"Week {body.week} hasn't locked yet")
    if body.gameId not in nfl_week["gameIds"]:
        raise ApiError(400, f"That game isn't in Week {body.week}")
    if (body.awayScore is None) != (body.homeScore is None):
        raise ApiError(400, "Send both scores, or neither to clear the override")

    key = {"PK": weeks.week_pk(body.groupId, feed.season, body.week), "SK": f"OVERRIDE#{body.gameId}"}
    if body.awayScore is None:
        table.delete_item(Key=key)
    else:
        table.put_item(Item={
            **key, "gameId": body.gameId, "awayScore": body.awayScore, "homeScore": body.homeScore,
            "by": me["sub"], "at": nfl_store.iso(feed.now),
        })
    return respond(200, results.regrade(table, group, [body.week]))
