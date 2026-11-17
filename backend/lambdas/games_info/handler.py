"""GET /games/info?groupId=g&gameId=e: one game's line, records, form, injuries, weather and head-to-head.

Members only. The build and its cache are in common/game_view.py. `writeup` is the
Film Room preview (common/writeup.py) when one was written. Replay groups get the
real season's, every one of which was written before its kickoff.
"""

import os

import boto3

from lambdas.common import flags, nfl_store, writeup
from lambdas.common.api import ApiError, api_handler, query_param, respond, user
from lambdas.common.game_view import cached, payload
from lambdas.common.groups import membership

dynamodb = boto3.resource("dynamodb")


@api_handler("games_info")
def handler(event, context):
    me = user(event)
    gid = query_param(event, "groupId")
    flags.require("gameInfo", gid)
    game_id = query_param(event, "gameId")
    if not game_id.isdigit():
        raise ApiError(400, "gameId must be an ESPN event id")
    table = dynamodb.Table(os.environ["APP_TABLE"])
    group = table.get_item(Key={"PK": f"GROUP#{gid}", "SK": "META"}).get("Item")
    if not group:
        raise ApiError(404, "Group not found")
    membership(table, gid, me["sub"])

    feed = nfl_store.for_group(group)
    game = feed.game(game_id)
    if not game:
        raise ApiError(404, "That game isn't on this season's schedule")
    info, source = cached(game, feed)
    stored = flags.enabled("filmRoom", gid) and writeup.get(game_id)
    film_room = stored and {k: stored[k] for k in ("text", "model", "generatedAt")}
    return respond(200, {**payload(game, info, source, feed.now), "writeup": film_room})
