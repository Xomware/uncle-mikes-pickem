"""POST /games/cancel {groupId, week, gameId, canceled}: void or restore a game for the group. Organizer.

Before lock the week's N moves with it, and every saved pick is re-ranked to fit
(common/picks.rerank). After lock the picks stand: the game voids to 0 for everyone,
nothing is re-ranked (PLAN.md "Decisions taken"), and the week regrades.
"""

import os
from typing import Annotated

import boto3
from boto3.dynamodb.conditions import Key
from pydantic import Field, StringConstraints

from lambdas.common import picks, results, weeks
from lambdas.common.api import ApiError, Request, api_handler, parse_body, respond, user
from lambdas.common.groups import require_organizer

dynamodb = boto3.resource("dynamodb")


class CancelGame(Request):
    groupId: Annotated[str, StringConstraints(min_length=1, max_length=64)]
    week: Annotated[int, Field(ge=1, le=18)]
    gameId: Annotated[str, StringConstraints(min_length=1, max_length=20)]
    canceled: bool


@api_handler("games_cancel")
def handler(event, context):
    me = user(event)
    body = parse_body(event, CancelGame)
    table = dynamodb.Table(os.environ["APP_TABLE"])
    group, member, feed, nfl_week = weeks.load(table, body.groupId, me["sub"], body.week)
    require_organizer(member)
    locked = feed.locked(nfl_week)
    if body.gameId not in nfl_week["gameIds"]:
        raise ApiError(400, f"That game isn't in Week {body.week}")
    if body.canceled and body.gameId == nfl_week["tiebreakGameId"]:
        raise ApiError(409, "That's the tiebreak game, so it can't be canceled")

    season = int(group["season"])
    pk = weeks.week_pk(body.groupId, season, body.week)
    items = table.query(KeyConditionExpression=Key("PK").eq(pk))["Items"]
    gow_item = next((i for i in items if i["SK"] == "GOW"), None)
    # After lock the GOW can't move, so canceling it just voids it like any other game.
    if body.canceled and not locked and gow_item and gow_item["gameId"] == body.gameId:
        raise ApiError(409, "Choose another game of the week first")

    stored = next((i for i in items if i["SK"] == "CANCELED"), {"gameIds": []})
    ids = set(stored["gameIds"]) | {body.gameId} if body.canceled else set(stored["gameIds"]) - {body.gameId}
    table.put_item(Item={"PK": pk, "SK": "CANCELED", "gameIds": sorted(ids)})
    if locked:
        graded = results.regrade(table, group, [body.week])
        return respond(200, {"canceled": sorted(ids), "picksUpdated": 0, "regraded": graded["weeks"]})

    games = [g for g in feed.games(body.week) if g["gameId"] not in ids]
    pick_items = [i for i in items if i["SK"].startswith("PICK#")]
    for item in pick_items:
        fitted = picks.rerank(item["picks"], games)
        table.update_item(
            Key={"PK": pk, "SK": item["SK"]},
            UpdateExpression="SET picks = :p, complete = :c",
            ExpressionAttributeValues={":p": fitted, ":c": picks.complete(fitted, games, item["tiebreak"])},
        )
    return respond(200, {"canceled": sorted(ids), "games": len(games), "picksUpdated": len(pick_items)})
