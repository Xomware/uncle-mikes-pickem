"""POST /picks/set {groupId, week, picks: {gameId: {team, conf}}, tiebreak}: save the caller's picks.

Drafts are fine; the stored `complete` flag says whether the week is fully picked.
The tiebreak is the total points of the week's tiebreakGameId game.
"""

import os
from typing import Annotated

import boto3
from pydantic import Field, StringConstraints

from lambdas.common import clock, nfl_store, picks, weeks
from lambdas.common.api import ApiError, Request, api_handler, parse_body, respond, user

dynamodb = boto3.resource("dynamodb")


class Pick(Request):
    team: Annotated[str, StringConstraints(min_length=2, max_length=4)] | None = None
    conf: Annotated[int, Field(ge=1, le=32)]


class SetPicks(Request):
    groupId: Annotated[str, StringConstraints(min_length=1, max_length=64)]
    week: Annotated[int, Field(ge=1, le=18)]
    picks: Annotated[dict[str, Pick], Field(max_length=32)]
    tiebreak: Annotated[int, Field(ge=0, le=200)] | None = None


@api_handler("picks_set")
def handler(event, context):
    me = user(event)
    body = parse_body(event, SetPicks)
    table = dynamodb.Table(os.environ["APP_TABLE"])
    group, member, nfl_week = weeks.load(table, body.groupId, me["sub"], body.week)
    if body.week < member["joinedWeek"]:
        raise ApiError(409, f"You joined in Week {member['joinedWeek']}")
    weeks.require_unlocked(group, nfl_week)

    season = int(group["season"])
    pk = weeks.week_pk(body.groupId, season, body.week)
    if "Item" not in table.get_item(Key={"PK": pk, "SK": "GOW"}):
        raise ApiError(409, "Picks open once the game of the week is set")

    games = nfl_store.list_games(season, body.week)
    chosen = {gid: p.model_dump() for gid, p in body.picks.items()}
    try:
        picks.validate(chosen, games)
    except ValueError as e:
        raise ApiError(400, str(e))

    item = {
        "PK": pk,
        "SK": f"PICK#{me['sub']}",
        "sub": me["sub"],
        "picks": chosen,
        "tiebreak": body.tiebreak,
        "complete": picks.complete(chosen, games, body.tiebreak),
        "submittedAt": nfl_store.iso(clock.now(group)),
    }
    table.put_item(Item=item)
    return respond(200, {"pick": picks.public(item)})
