"""GET /gow/peek?t=<token>: what a GOW email button would choose. Public: the signed token is the credential.

Read-only, so a mail scanner fetching it changes nothing. state is open, used,
canceled or closed (locked or past the link's expiry); the page offers Confirm
only when open.
"""

import os

import boto3

from lambdas.common import gow, gow_link, weeks
from lambdas.common.api import api_handler, query_param, respond

dynamodb = boto3.resource("dynamodb")


@api_handler("gow_peek")
def handler(event, context):
    token = query_param(event, "t")
    table = dynamodb.Table(os.environ["APP_TABLE"])
    link, group, feed, nfl_week = gow_link.resolve(table, token)
    pk = weeks.week_pk(link.group_id, link.season, link.week)
    game = next(g for g in feed.games(link.week) if g["gameId"] == link.game_id)
    used = "Item" in dynamodb.Table(os.environ["OPS_TABLE"]).get_item(Key=gow_link.used_key(link, token))
    if gow_link.closed(link, feed, nfl_week):
        state = "closed"
    elif used:
        state = "used"
    elif link.game_id in weeks.canceled_ids(table, pk):
        state = "canceled"
    else:
        state = "open"
    current = table.get_item(Key={"PK": pk, "SK": "GOW"}).get("Item")
    return respond(200, {
        "groupId": link.group_id,
        "groupName": group["name"],
        "week": link.week,
        "lockAt": nfl_week["lockAt"],
        "game": {
            "gameId": game["gameId"],
            "away": game["away"]["abbr"],
            "home": game["home"]["abbr"],
            "kickoff": game["kickoff"],
            "hype": (game.get("hype") or {}).get("score"),
        },
        "gow": gow.public(current),
        "state": state,
    })
