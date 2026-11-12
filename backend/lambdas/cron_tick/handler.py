"""pickem-cron-tick: keeps pickem-nfl's WEEK and GAME items current from ESPN.

Scheduled every 2 minutes. A tick works only inside a game window (live: the
current week) or on the hourly refresh (current and next week, so Tuesday's
GOW pick has next week's games). {"force": true} runs the hourly refresh now.
Every tick that works writes a poll row to pickem-ops.
"""

from __future__ import annotations

import json
import os
from datetime import datetime, timedelta, timezone

import boto3

from lambdas.common import espn, nfl_store

WINDOW_BEFORE = timedelta(minutes=15)
# A suspended or postponed game never completes; don't let it hold the window open.
WINDOW_AFTER = timedelta(hours=6)
RUN_TTL = timedelta(days=30)
REGULAR = 2
LAST_WEEK = 18

dynamodb = boto3.resource("dynamodb")


def parse(ts: str) -> datetime:
    """ESPN writes "2026-11-13T01:15Z"; nfl_store.iso adds seconds."""
    return datetime.fromisoformat(ts.replace("Z", "+00:00"))


def choose_mode(now: datetime, games: list[dict], force: bool) -> str | None:
    if force:
        return "force"
    # rate(2 minutes) puts exactly one tick in the first two minutes of each hour.
    if now.minute < 2:
        return "hourly"
    for g in games:
        kickoff = parse(g["kickoff"])
        if not g["completed"] and kickoff - WINDOW_BEFORE <= now < kickoff + WINDOW_AFTER:
            return "live"
    return None


def target_weeks(season_type: int, week: int, mode: str) -> list[int]:
    if season_type == 1:  # preseason: get Week 1 in place before it starts
        return [1]
    if season_type != REGULAR:
        return []
    if mode == "live":
        return [week]
    return [week, week + 1] if week < LAST_WEEK else [week]


def lines(odds: dict) -> dict:
    """ESPN's sign convention: spread is the home team's line, negative when home is favored."""
    ml = odds.get("moneyline") or {}

    def american(side: str) -> int | None:
        price = ((ml.get(side) or {}).get("close") or {}).get("odds")
        if price is None:
            return None
        return 100 if price == "EVEN" else int(price)

    return {
        "provider": odds["provider"]["name"],
        "details": odds.get("details"),
        "spread": odds.get("spread"),
        "overUnder": odds.get("overUnder"),
        "homeMoneyline": american("home"),
        "awayMoneyline": american("away"),
    }


def game_fields(event: dict) -> dict:
    c = event["competitions"][0]
    status = c["status"]["type"]
    teams = {
        t["homeAway"]: {"id": t["team"]["id"], "abbr": t["team"]["abbreviation"]} for t in c["competitors"]
    }
    venue = c["venue"]
    game = {
        "gameId": event["id"],
        "kickoff": nfl_store.iso(parse(c["date"])),
        # False while the NFL hasn't set the time (Week 18 until Week 17 ends); kickoff is a placeholder.
        "timeValid": c.get("timeValid", True),
        "status": status["name"],
        "state": status["state"],
        "completed": status["completed"],
        "away": teams["away"],
        "home": teams["home"],
        "venue": {"id": venue["id"], "name": venue["fullName"], "indoor": venue.get("indoor")},
        "neutralSite": c["neutralSite"],
        "broadcasts": [n for b in c.get("broadcasts", []) for n in b["names"]],
    }
    # Only before kickoff, so the stored line is the closing line.
    if status["state"] == "pre" and c.get("odds"):
        game["lines"] = lines(c["odds"][0])
    return game


def week_fields(games: list[dict]) -> tuple[str, str]:
    """(lockAt, tiebreakGameId): first kickoff, and the last game with the higher event id on a tie."""
    lock_at = min(g["kickoff"] for g in games)
    last = max(games, key=lambda g: (g["kickoff"], int(g["gameId"])))
    return lock_at, last["gameId"]


def scoreboard(season: int | None = None, week: int | None = None) -> dict:
    url = f"{espn.SITE}/scoreboard"
    if week is not None:
        url += f"?seasontype={REGULAR}&week={week}&dates={season}"
    status, body = espn.get(url)
    if status != 200:
        raise RuntimeError(f"{url} returned {status}")
    return json.loads(body)


def refresh_week(season: int, week: int, board: dict, now: datetime) -> int:
    games = [game_fields(e) for e in board["events"]]
    for g in games:
        nfl_store.save_game(season, week, g)
    if games:
        lock_at, tiebreak = week_fields(games)
        nfl_store.save_week(season, week, lock_at, tiebreak, [g["gameId"] for g in games], nfl_store.iso(now))
    return len(games)


def refresh(now: datetime, mode: str) -> dict:
    board = scoreboard()
    season, season_type, current = board["season"]["year"], board["season"]["type"], board["week"]["number"]
    weeks = target_weeks(season_type, current, mode)
    if weeks:
        nfl_store.set_current(season, weeks[0])
    games = 0
    for week in weeks:
        same = season_type == REGULAR and week == current
        games += refresh_week(season, week, board if same else scoreboard(season, week), now)
    return {"season": season, "weeks": weeks, "games": games}


def record_run(now: datetime, mode: str, result: dict) -> None:
    dynamodb.Table(os.environ["OPS_TABLE"]).put_item(
        Item={
            "PK": "POLL#cron_tick",
            "SK": nfl_store.iso(now),
            "mode": mode,
            **result,
            "ttl": int((now + RUN_TTL).timestamp()),
        }
    )


def handler(event, context):
    now = datetime.now(timezone.utc)
    current = nfl_store.current_week()
    games = nfl_store.list_games(*current) if current else []
    mode = choose_mode(now, games, bool((event or {}).get("force")))
    if mode is None:
        return {"mode": None}

    try:
        result = refresh(now, mode)
    except Exception as e:
        # The failed run is the row someone goes looking for; re-raise so Errors fires.
        record_run(now, mode, {"error": f"{type(e).__name__}: {e}"})
        raise
    record_run(now, mode, result)
    return {"mode": mode, **result}
