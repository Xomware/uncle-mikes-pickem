"""pickem-replay-load: rebuilds the 2026 replay rows in pickem-nfl (REPLAY#2026#W..).

Schedule, finals and closing lines come from nflverse. Weeks with F1 captures
(10 onward) also get every pre-game scoreboard snapshot from S3, so a replay
group sees the line and weather as they stood at its virtual time
(nfl_store.as_of). Invoked by hand from the replay-load workflow; re-run it as
2026 finishes to pick up new finals.
"""

from __future__ import annotations

import gzip
import json
import os
from collections import defaultdict
from datetime import datetime, timezone

import boto3

from lambdas.common import hype, nfl_store, nflverse

SEASON = 2026
s3 = boto3.client("s3")


def snapshot_lines(odds: dict) -> dict:
    return {k: odds.get(k) for k in ("details", "spread", "overUnder")} | {"provider": odds["provider"]["name"]}


def snapshots(boards: list[tuple[str, dict]]) -> dict[str, list[dict]]:
    """Pre-game state per event id, oldest first, from (capture prefix, scoreboard) pairs."""
    out = defaultdict(list)
    for prefix, board in boards:
        stamp = prefix.rsplit("/", 1)[1]
        at = nfl_store.iso(datetime.strptime(stamp, "%Y-%m-%dT%H%M%SZ").replace(tzinfo=timezone.utc))
        for e in board["events"]:
            c = e["competitions"][0]
            if c["status"]["type"]["state"] != "pre":
                continue
            snap = {"at": at, "prefix": prefix}
            if c.get("odds"):
                snap["lines"] = snapshot_lines(c["odds"][0])
            if e.get("weather"):
                snap["weather"] = e["weather"]
            out[e["id"]].append(snap)
    return out


def team_info(boards: list[tuple[str, dict]]) -> dict[str, dict]:
    """Logo and colors by abbr from the captured scoreboards. Every team plays in Weeks 10+, so
    after a few captures this covers the league, Weeks 1-9 included."""
    return {
        c["team"]["abbreviation"]: nfl_store.team(c["team"])
        for _, board in boards
        for e in board["events"]
        for c in e["competitions"][0]["competitors"]
    }


def game_row(g: dict, snaps: list[dict], teams: dict[str, dict]) -> dict:
    def side(abbr: str) -> dict:
        return teams.get(abbr) or {"abbr": abbr, "logo": nfl_store.logo_url(abbr)}

    return {
        "gameId": g["gameId"],
        "nflverseId": g["nflverseId"],
        "kickoff": g["kickoff"],
        "timeValid": g["timeValid"],
        "away": side(g["away"]),
        "home": side(g["home"]),
        "lines": {"provider": "nflverse", "details": None, "spread": g["spread"], "overUnder": g["overUnder"]},
        **{k: g[k] for k in ("awayScore", "homeScore", "winner", "tie", "final")},
        "snapshots": snaps,
    }


def weeks(text: str, snaps: dict[str, list[dict]], teams: dict[str, dict]) -> dict[int, list[dict]]:
    out = defaultdict(list)
    for g in nflverse.games(text, SEASON).values():
        if g["gameType"] == "REG":
            out[g["week"]].append(game_row(g, snaps.get(g["gameId"], []), teams))
    for games in out.values():
        standalone = hype.standalone_ids(games)
        for g in games:
            g["hype"] = hype.hype(g, g["gameId"] in standalone)
    return dict(out)


def captured_boards() -> list[tuple[str, dict]]:
    bucket = os.environ["CAPTURE_BUCKET"]
    pages = s3.get_paginator("list_objects_v2").paginate(Bucket=bucket, Prefix=f"raw/season={SEASON}/type=2/")
    keys = sorted(o["Key"] for p in pages for o in p.get("Contents", []) if o["Key"].endswith("/scoreboard.json.gz"))
    boards = []
    for key in keys:
        body = s3.get_object(Bucket=bucket, Key=key)["Body"].read()
        boards.append((key.rsplit("/", 1)[0], json.loads(gzip.decompress(body))))
    return boards


def handler(event, context):
    boards = captured_boards()
    rows = weeks(nflverse.fetch(), snapshots(boards), team_info(boards))
    nfl_store.save_replay(SEASON, rows, nfl_store.iso(datetime.now(timezone.utc)))
    return {"weeks": len(rows), "games": sum(map(len, rows.values())), "captures": len(boards)}
