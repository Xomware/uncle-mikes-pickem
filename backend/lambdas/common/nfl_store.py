"""The pickem-nfl table. cron_tick is the only writer; everything else reads.

    SEASON#2026#W10 / WEEK           lockAt, tiebreakGameId, gameIds
    SEASON#2026#W10 / GAME#<espnId>  one game, keyed by ESPN event id
    CURRENT / WEEK                   the regular-season week ESPN calls current

Times are UTC strings from iso(), so they compare correctly as strings.
Team codes are ESPN's (LAR, WSH).
"""

from __future__ import annotations

import json
import os
from datetime import datetime
from decimal import Decimal

import boto3
from boto3.dynamodb.conditions import Key

dynamodb = boto3.resource("dynamodb")


def table():
    return dynamodb.Table(os.environ["NFL_TABLE"])


def iso(dt: datetime) -> str:
    return dt.strftime("%Y-%m-%dT%H:%M:%SZ")


def week_pk(season: int, week: int) -> str:
    return f"SEASON#{season}#W{week:02d}"


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
    resp = table().query(
        KeyConditionExpression=Key("PK").eq(week_pk(season, week)) & Key("SK").begins_with("GAME#")
    )
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
