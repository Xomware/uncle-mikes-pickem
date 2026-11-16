"""GET /games/info?groupId=g&gameId=e: one game's line, records, form, injuries, weather and head-to-head.

Members only. The build and its cache are in common/game_view.py.
"""

import os

import boto3

from lambdas.common import nfl_store
from lambdas.common.api import ApiError, api_handler, query_param, respond, user
from lambdas.common.game_view import cached, payload
from lambdas.common.groups import membership

dynamodb = boto3.resource("dynamodb")


@api_handler("games_info")
def handler(event, context):
    me = user(event)
    gid = query_param(event, "groupId")
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
    return respond(200, payload(game, info, source, feed.now))
