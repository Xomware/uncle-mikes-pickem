"""GET /picks/get?groupId=g[&week=n]: one week's games, GOW and the picks the caller may see.

Before lock that is only the caller's own picks; after lock, the whole group's (common/gate.py).
Without ?week= it is the week ESPN calls current, clamped to the group's season.
"""

import os

import boto3
from boto3.dynamodb.conditions import Key

from lambdas.common import clock, gate, gow, nfl_store, picks, weeks
from lambdas.common.api import ApiError, api_handler, query_param, respond, user

dynamodb = boto3.resource("dynamodb")

GAME_FIELDS = ("gameId", "kickoff", "away", "home", "lines", "broadcasts", "state", "completed", "winner")


def default_week(season: int) -> int:
    current = nfl_store.current_week()
    if not current or current[0] < season:
        return 1
    return current[1] if current[0] == season else 18


def week_param(event: dict, season: int) -> int:
    raw = (event.get("queryStringParameters") or {}).get("week")
    if not raw:
        return default_week(season)
    if not raw.isdigit() or not 1 <= int(raw) <= 18:
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

    season = int(group["season"])
    week = week_param(event, season)
    nfl_week = nfl_store.get_week(season, week)
    if not nfl_week:
        raise ApiError(404, f"Week {week} isn't on the schedule yet")
    locked = weeks.locked(group, nfl_week)
    week_items = table.query(KeyConditionExpression=Key("PK").eq(weeks.week_pk(gid, season, week)))["Items"]
    shown = gate.visible_picks(week_items, me["sub"], locked)

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
                "now": nfl_store.iso(clock.now(group)),
            },
            "games": [{k: g.get(k) for k in GAME_FIELDS} for g in nfl_store.list_games(season, week)],
            "gow": gow.public(next((i for i in week_items if i["SK"] == "GOW"), None)),
            "mine": next((picks.public(i) for i in shown if i["sub"] == me["sub"]), None),
            "members": [{"sub": m["sub"], "name": m["name"]} for m in members.values()],
            "picks": [picks.public(i) for i in shown] if locked else [],
        },
    )
