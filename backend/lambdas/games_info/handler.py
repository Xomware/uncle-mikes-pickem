"""GET /games/info?groupId=g&gameId=e: one game's line, records, form, injuries, weather and head-to-head.

Members only. ESPN's summary is distilled (common/game_info.py) with nflverse's roof and
head-to-head, and cached on pickem-nfl: live builds for 30 minutes, replay builds per
capture for good. A replay group reads the latest capture before its clock, so nothing
past its virtual time shows; a game with no capture yet returns the GAME item alone and
says so in `source`. Score and state always come from the GAME item, never the cache.
"""

import gzip
import json
import os
from datetime import datetime, timedelta

import boto3

from lambdas.common import espn, game_info, nfl_store, nflverse
from lambdas.common.api import ApiError, api_handler, query_param, respond, user
from lambdas.common.groups import membership

CACHE_FOR = timedelta(minutes=30)
INDOOR = ("dome", "closed")
GAME_FIELDS = ("gameId", "week", "kickoff", "timeValid", "state", "completed", "awayScore", "homeScore", "winner", "tie")
NO_CAPTURE = "No ESPN snapshot before this point in the replay, so injuries, form and weather aren't available."

dynamodb = boto3.resource("dynamodb")
s3 = boto3.client("s3")


def captured_summary(prefix: str, game_id: str) -> dict | None:
    key = f"{prefix}/summary-{game_id}.json.gz"
    try:
        body = s3.get_object(Bucket=os.environ["CAPTURE_BUCKET"], Key=key)["Body"].read()
    except s3.exceptions.NoSuchKey:
        return None  # that capture's fetch for this game failed; its manifest has the status
    return json.loads(gzip.decompress(body))


def live_summary(game_id: str) -> dict:
    status, body = espn.get(f"{espn.SITE}/summary?event={game_id}")
    if status != 200:
        raise ApiError(502, "ESPN didn't send this game's details. Try again in a minute.")
    return json.loads(body)


def build(game: dict, season: int, summary: dict | None, built_at: str) -> dict:
    text = nflverse.fetch()
    row = nflverse.games(text, season).get(game["gameId"], {})
    h2h = nflverse.meetings(text, game["away"]["abbr"], game["home"]["abbr"], game["kickoff"])
    return {**(game_info.distill(summary) if summary else {}), "roof": row.get("roof"), "headToHead": h2h, "builtAt": built_at}


def cached(game: dict, feed: nfl_store.Feed) -> tuple[dict, dict]:
    """(build, source) for the game as the group sees it."""
    now = nfl_store.iso(feed.now)
    if not feed.replay:
        hit = nfl_store.get_info(game["gameId"], "live")
        if hit and feed.now - nfl_store.parse(hit["builtAt"]) < CACHE_FOR:
            return hit, {"kind": "espn", "at": hit["builtAt"]}
        info = build(game, feed.season, live_summary(game["gameId"]), now)
        nfl_store.save_info(game["gameId"], "live", info)
        return info, {"kind": "espn", "at": now}

    prefix = game.get("capturePrefix")
    key = prefix or f"none#{feed.season}"
    info = nfl_store.get_info(game["gameId"], key)
    if not info:
        info = build(game, feed.season, prefix and captured_summary(prefix, game["gameId"]), now)
        nfl_store.save_info(game["gameId"], key, info)
    if "teams" not in info:
        return info, {"kind": "none", "at": None, "note": NO_CAPTURE}
    return info, {"kind": "capture", "at": game["capturedAt"]}


def side(team: dict, info: dict) -> dict:
    extra = info.get("teams", {}).get(team["abbr"], {})
    return {**team, **extra, "form": extra.get("form", []), "injuries": extra.get("injuries", [])}


def payload(game: dict, info: dict, source: dict, now: datetime) -> dict:
    stored_venue = game.get("venue") or {}
    roof = info.get("roof") or ("dome" if stored_venue.get("indoor") else None)
    weather = None
    if roof not in INDOOR and (info.get("weather") or game.get("weather")):
        weather = {**(info.get("weather") or {}), "description": (game.get("weather") or {}).get("displayValue")}
    # The GAME's line is the one picks were made against; the summary only fills the moneylines it lacks.
    lines = {**(info.get("odds") or {}), **{k: v for k, v in (game.get("lines") or {}).items() if v is not None}}
    return {
        "game": {
            **{k: game.get(k) for k in GAME_FIELDS},
            "lines": lines or None,
            "broadcasts": game.get("broadcasts") or info.get("broadcasts") or [],
            "venue": {**(info.get("venue") or {"name": stored_venue.get("name")}), "roof": roof},
        },
        "away": side(game["away"], info),
        "home": side(game["home"], info),
        "weather": weather,
        # Meetings are cut at this game's kickoff when built. A replay group browsing ahead
        # (Week 3 looking at Week 10) must not see a Week 5 result its clock hasn't reached.
        "headToHead": [m for m in info.get("headToHead", []) if nfl_store.parse(m["kickoff"]) + nfl_store.RESULT_DELAY <= now],
        "source": source,
    }


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
