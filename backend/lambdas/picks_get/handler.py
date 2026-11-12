"""GET /picks/get?groupId=g[&week=n]: one week's games, GOW and the picks the caller may see.

Before lock that is only the caller's own picks; after lock, the whole group's (common/gate.py).
Without ?week= it is the week ESPN calls current, clamped to the group's season; for a
replay group, the next week to lock on its clock.
"""

import os

import boto3
from boto3.dynamodb.conditions import Key

from lambdas.common import gate, gow, nfl_store, picks, weeks
from lambdas.common.api import ApiError, api_handler, query_param, respond, user

dynamodb = boto3.resource("dynamodb")

LAST_WEEK = 18
GAME_FIELDS = ("gameId", "kickoff", "away", "home", "lines", "broadcasts", "state", "completed", "winner")


def default_week(feed: nfl_store.Feed) -> int:
    if feed.replay:
        return min(LAST_WEEK, (feed.last_locked_week() or 0) + 1)
    current = nfl_store.current_week()
    if not current or current[0] < feed.season:
        return 1
    return current[1] if current[0] == feed.season else LAST_WEEK


def week_param(event: dict, feed: nfl_store.Feed) -> int:
    raw = (event.get("queryStringParameters") or {}).get("week")
    if not raw:
        return default_week(feed)
    if not raw.isdigit() or not 1 <= int(raw) <= LAST_WEEK:
        raise ApiError(400, "week must be 1 to 18")
    return int(raw)


@api_handler("picks_get")
def handler(event, context):
    me = user(event)
    gid = query_param(event, "groupId")
    table = dynamodb.Table(os.environ["APP_TABLE"])
    items = table.query(KeyConditionExpression=Key("PK").eq(f"GROUP#{gid}"))["Items"]
    group = next((i for i in items if i["SK"] == "META"), None)
    members = {i["sub"]: i for i in items if i["SK"].startswith("MEMBER#")}
    if not group or me["sub"] not in members:
        raise ApiError(404, "Group not found")

    feed = nfl_store.for_group(group)
    season = feed.season
    week = week_param(event, feed)
    nfl_week = feed.week(week)
    if not nfl_week:
        raise ApiError(404, f"Week {week} isn't on the schedule yet")
    locked = feed.locked(nfl_week)
    week_items = table.query(KeyConditionExpression=Key("PK").eq(weeks.week_pk(gid, season, week)))["Items"]
    shown = gate.visible_picks(week_items, me["sub"], locked)
    canceled = next((set(i["gameIds"]) for i in week_items if i["SK"] == "CANCELED"), set())

    return respond(
        200,
        {
            "group": {k: group[k] for k in ("groupId", "name", "season")},
            "role": members[me["sub"]]["role"],
            "week": {
                "season": season,
                "week": week,
                "lockAt": nfl_week["lockAt"],
                "tiebreakGameId": nfl_week["tiebreakGameId"],
                "locked": locked,
                # The group's clock, so a replay group's countdown runs on virtual time.
                "now": nfl_store.iso(feed.now),
            },
            "games": [
                {**{k: g.get(k) for k in GAME_FIELDS}, "canceled": g["gameId"] in canceled} for g in feed.games(week)
            ],
            "gow": gow.public(next((i for i in week_items if i["SK"] == "GOW"), None)),
            "mine": next((picks.public(i) for i in shown if i["sub"] == me["sub"]), None),
            "members": [{"sub": m["sub"], "name": m["name"]} for m in members.values()],
            "picks": [picks.public(i) for i in shown] if locked else [],
        },
    )
