"""The pickem-nfl table. cron_tick is the only writer; everything else reads.

    SEASON#2026#W10 / WEEK           lockAt, tiebreakGameId, gameIds
    SEASON#2026#W10 / GAME#<espnId>  one game, keyed by ESPN event id
    CURRENT / WEEK                   the regular-season week ESPN calls current

The 2026 replay (F5) keeps its own copy, written only by replay_load:

    REPLAY#2026#W10 / WEEK           same shape as the real WEEK
    REPLAY#2026#W10 / GAME#<espnId>  a GAME plus nflverse finals and capture snapshots
    REPLAY#2026 / WEEKS              lockAts {"1": ..., "18": ...}

It is separate because cron_tick is still writing 2026 live. Its WEEK freezes
at lock, and its GAMEs carry only what ESPN showed at the time, so a replay on
the same rows would be overwritten and would be missing Weeks 1-9 entirely.

Times are UTC strings from iso(), so they compare correctly as strings.
Team codes are ESPN's (LAR, WSH).
"""

from __future__ import annotations

import json
import os
from dataclasses import dataclass
from datetime import datetime, timedelta
from decimal import Decimal

import boto3
from boto3.dynamodb.conditions import Key

from lambdas.common import clock

dynamodb = boto3.resource("dynamodb")

# nflverse has no end time, so a replay game's result shows this long after kickoff.
RESULT_DELAY = timedelta(hours=3, minutes=30)


def table():
    return dynamodb.Table(os.environ["NFL_TABLE"])


def iso(dt: datetime) -> str:
    return dt.strftime("%Y-%m-%dT%H:%M:%SZ")


def week_pk(season: int, week: int) -> str:
    return f"SEASON#{season}#W{week:02d}"


def replay_pk(season: int, week: int) -> str:
    return f"REPLAY#{season}#W{week:02d}"


def parse(ts: str) -> datetime:
    return datetime.fromisoformat(ts.replace("Z", "+00:00"))


def logo_url(abbr: str) -> str:
    """ESPN's CDN path for a team logo. The art is NFL trademark, loaded from ESPN at runtime, never committed."""
    return f"https://a.espncdn.com/i/teamlogos/nfl/500/{abbr.lower()}.png"


def team(espn_team: dict) -> dict:
    """A GAME's away/home: ESPN's id, abbr, logo and hex colors (no '#')."""
    abbr = espn_team["abbreviation"]
    return {
        "id": espn_team["id"],
        "abbr": abbr,
        "logo": espn_team.get("logo") or logo_url(abbr),
        "color": espn_team.get("color"),
        "alternateColor": espn_team.get("alternateColor"),
    }


def week_fields(games: list[dict]) -> tuple[str, str]:
    """(lockAt, tiebreakGameId): first kickoff, and the last game with the higher event id on a tie."""
    lock_at = min(g["kickoff"] for g in games)
    last = max(games, key=lambda g: (g["kickoff"], int(g["gameId"])))
    return lock_at, last["gameId"]


def plain(value):
    """DynamoDB Decimals back to int/float, so items serialize as JSON."""
    if isinstance(value, Decimal):
        return int(value) if value == value.to_integral_value() else float(value)
    if isinstance(value, dict):
        return {k: plain(v) for k, v in value.items()}
    if isinstance(value, list):
        return [plain(v) for v in value]
    return value


def get_week(season: int, week: int) -> dict | None:
    item = table().get_item(Key={"PK": week_pk(season, week), "SK": "WEEK"}).get("Item")
    return plain(item) if item else None


def list_games(season: int, week: int) -> list[dict]:
    """The week's games by kickoff, then event id."""
    return _games(week_pk(season, week))


def _games(pk: str) -> list[dict]:
    resp = table().query(KeyConditionExpression=Key("PK").eq(pk) & Key("SK").begins_with("GAME#"))
    return sorted((plain(i) for i in resp["Items"]), key=lambda g: (g["kickoff"], int(g["gameId"])))


def current_week() -> tuple[int, int] | None:
    """(season, week) ESPN calls current. It flips to the next week on Wednesday."""
    item = table().get_item(Key={"PK": "CURRENT", "SK": "WEEK"}).get("Item")
    return (int(item["season"]), int(item["week"])) if item else None


def save_game(season: int, week: int, game: dict) -> None:
    """SET only the fields given, so attributes other writers own (finals) survive."""
    fields = json.loads(json.dumps(game), parse_float=Decimal)
    table().update_item(
        Key={"PK": week_pk(season, week), "SK": f"GAME#{game['gameId']}"},
        UpdateExpression="SET " + ", ".join(f"#{k} = :{k}" for k in fields),
        ExpressionAttributeNames={f"#{k}": k for k in fields},
        ExpressionAttributeValues={f":{k}": v for k, v in fields.items()},
    )


def save_week(season: int, week: int, lock_at: str, tiebreak_game_id: str, game_ids: list[str], now: str) -> bool:
    """Write WEEK unless its stored lockAt has passed. False when it was frozen.

    A flex can move the first kickoff, so lockAt is recomputed every refresh, but
    once picks have locked neither the lock nor the tiebreak game may move.
    """
    try:
        table().update_item(
            Key={"PK": week_pk(season, week), "SK": "WEEK"},
            UpdateExpression="SET season = :s, week = :w, lockAt = :l, tiebreakGameId = :t, gameIds = :g, updatedAt = :n",
            ConditionExpression="attribute_not_exists(lockAt) OR lockAt > :n",
            ExpressionAttributeValues={
                ":s": season, ":w": week, ":l": lock_at, ":t": tiebreak_game_id, ":g": game_ids, ":n": now,
            },
        )
    except dynamodb.meta.client.exceptions.ConditionalCheckFailedException:
        return False
    return True


def set_current(season: int, week: int) -> None:
    table().put_item(Item={"PK": "CURRENT", "SK": "WEEK", "season": season, "week": week})


def save_replay(season: int, weeks: dict[int, list[dict]], now: str) -> None:
    """Overwrite the replay rows. Re-running after more of 2026 is played fills in the new finals."""
    lock_ats = {}
    with table().batch_writer() as batch:
        for week, games in weeks.items():
            pk = replay_pk(season, week)
            lock_at, tiebreak = week_fields(games)
            lock_ats[str(week)] = lock_at
            batch.put_item(Item={
                "PK": pk, "SK": "WEEK", "season": season, "week": week, "lockAt": lock_at,
                "tiebreakGameId": tiebreak, "gameIds": [g["gameId"] for g in games], "updatedAt": now,
            })
            for g in games:
                item = json.loads(json.dumps(g), parse_float=Decimal)
                batch.put_item(Item={"PK": pk, "SK": f"GAME#{g['gameId']}", **item})
        batch.put_item(Item={"PK": f"REPLAY#{season}", "SK": "WEEKS", "lockAts": lock_ats, "updatedAt": now})


def get_replay_week(season: int, week: int) -> dict | None:
    item = table().get_item(Key={"PK": replay_pk(season, week), "SK": "WEEK"}).get("Item")
    return plain(item) if item else None


def replay_lock_ats(season: int) -> dict[int, str]:
    item = table().get_item(Key={"PK": f"REPLAY#{season}", "SK": "WEEKS"}).get("Item")
    return {int(w): t for w, t in item["lockAts"].items()} if item else {}


def games_as_of(season: int, week: int, now: datetime) -> list[dict]:
    """The replay week's games as someone would have seen them at `now`."""
    return [as_of(g, now) for g in _games(replay_pk(season, week))]


def as_of(game: dict, now: datetime) -> dict:
    """Lines and weather from the latest capture before `now`, else nflverse's closing line.

    Results stay hidden until kickoff + RESULT_DELAY.
    """
    at = iso(now)
    seen = [s for s in game.pop("snapshots", []) if s["at"] <= at]
    if seen:
        game["capturedAt"], game["capturePrefix"] = seen[-1]["at"], seen[-1]["prefix"]
        game["lines"] = seen[-1].get("lines") or game["lines"]
        game["weather"] = seen[-1].get("weather")
    kickoff = parse(game["kickoff"])
    game["completed"] = now >= kickoff + RESULT_DELAY
    game["state"] = "post" if game["completed"] else "in" if now >= kickoff else "pre"
    if not game["completed"]:
        game.update(awayScore=None, homeScore=None, winner=None, tie=False, final=False)
    return game


@dataclass(frozen=True)
class Feed:
    """NFL data as one group sees it: the replay rows on its virtual clock, or the live season."""

    season: int
    replay: bool
    now: datetime

    def week(self, week: int) -> dict | None:
        return get_replay_week(self.season, week) if self.replay else get_week(self.season, week)

    def games(self, week: int) -> list[dict]:
        return games_as_of(self.season, week, self.now) if self.replay else list_games(self.season, week)

    def locked(self, week_item: dict) -> bool:
        return week_item["lockAt"] <= iso(self.now)

    def last_locked_week(self) -> int | None:
        """Latest week whose lock has passed. None before Week 1 or while there is no data."""
        if self.replay:
            return max((w for w, t in replay_lock_ats(self.season).items() if t <= iso(self.now)), default=None)
        current = current_week()
        if current is None or current[0] < self.season:
            return None
        if current[0] > self.season:
            return 18
        stored = get_week(self.season, current[1])
        if stored and self.locked(stored):
            return current[1]
        return current[1] - 1 or None


def for_group(group: dict) -> Feed:
    """Every handler reading games, weeks or lock times for a group goes through this."""
    return Feed(int(group["season"]), bool(group.get("replay")), clock.now(group))
