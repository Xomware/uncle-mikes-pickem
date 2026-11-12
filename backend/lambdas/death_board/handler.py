"""GET /death/board?id=g: the group's death pool grid and the open week's games for the picker. Members only.

Another entry's pick is null until that week locks on the group clock; your own picks always show.
Grading writes livesLeft and eliminatedWeek; until it has, every entry has the season's starting lives.
"""

import os

import boto3
from boto3.dynamodb.conditions import Key

from lambdas.common import nfl_store
from lambdas.common.api import ApiError, api_handler, query_param, respond, user
from lambdas.common.death import LAST_WEEK, entries_pk, start_lives
from lambdas.common.groups import next_unlocked_week

dynamodb = boto3.resource("dynamodb")


def row(entry: dict, sub: str, names: dict, locked: set[int], lives: int) -> dict:
    mine = entry["ownerSub"] == sub
    picks = {int(w): t for w, t in entry["picks"].items()}
    shown = {w: t if mine or w in locked else None for w, t in sorted(picks.items())}
    eliminated = entry.get("eliminatedWeek")
    return {
        "entryId": entry["entryId"],
        "label": entry["label"],
        "ownerSub": entry["ownerSub"],
        "ownerName": names.get(entry["ownerSub"], ""),
        "mine": mine,
        "picks": {str(w): t for w, t in shown.items()},
        "used": sorted(t for t in shown.values() if t),
        "livesLeft": entry.get("livesLeft", lives),
        "status": "eliminated" if eliminated else "alive",
        "eliminatedWeek": eliminated,
    }


def game(g: dict) -> dict:
    lines = g.get("lines") or {}
    return {
        "gameId": g["gameId"],
        "kickoff": g["kickoff"],
        "away": g["away"]["abbr"],
        "home": g["home"]["abbr"],
        # ESPN convention: the home team's line, negative when home is favored.
        "spread": lines.get("spread"),
        "details": lines.get("details"),
    }


@api_handler("death_board")
def handler(event, context):
    me = user(event)
    gid = query_param(event, "id")
    table = dynamodb.Table(os.environ["APP_TABLE"])
    items = table.query(KeyConditionExpression=Key("PK").eq(f"GROUP#{gid}"))["Items"]
    meta = next((i for i in items if i["SK"] == "META"), None)
    names = {i["sub"]: i["name"] for i in items if i["SK"].startswith("MEMBER#")}
    if not meta or me["sub"] not in names:
        raise ApiError(404, "Group not found")
    season = int(meta["season"])
    versions = [i for i in items if i["SK"].startswith(f"RULES#S{season}#")]

    entries = table.query(
        KeyConditionExpression=Key("PK").eq(entries_pk(gid, season)) & Key("SK").begins_with("DEATH#")
    )["Items"]
    open_week = min(next_unlocked_week(meta), LAST_WEEK)
    weeks = {int(w) for e in entries for w in e["picks"]} | {open_week}
    feed = nfl_store.for_group(meta)
    stored = {w: feed.week(w) for w in weeks}
    locked = {w for w, s in stored.items() if s and feed.locked(s)}

    lives = start_lives(versions)
    rows = [row(e, me["sub"], names, locked, lives) for e in entries]
    rows.sort(key=lambda r: (-(r["eliminatedWeek"] or LAST_WEEK + 1), r["label"].lower()))
    current = stored[open_week]
    week = None
    if current:
        week = {
            "number": open_week,
            "lockAt": current["lockAt"],
            "locked": open_week in locked,
            "games": [game(g) for g in feed.games(open_week)],
        }
    return respond(200, {"season": season, "startLives": lives, "week": week, "entries": rows})
