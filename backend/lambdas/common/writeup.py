"""The game page's Film Room: a ~120-word Claude Haiku preview per game (F12.3).

The fact pack is the /games/info view (common/game_view.py) cut to what the
preview may mention. The model sees only the pack, so anything it says traces
back to ESPN or nflverse. Stored on pickem-nfl as GAME#<espnId> / WRITEUP with
the pack's hash: a rerun rewrites a game only when its facts changed.
"""

from __future__ import annotations

import hashlib
import json
import re
from zoneinfo import ZoneInfo

from lambdas.common import nfl_store

# Cheapest current Haiku; Dom runs this on Max-plan API credits.
MODEL = "claude-haiku-5-5"
ET = ZoneInfo("America/New_York")
# IR is season-long background the lines already reflect; the preview is about this week's report.
REPORTED = ("Out", "Doubtful", "Questionable")
INJURIES_PER_TEAM = 6
EMOJI = re.compile("[\U0001F000-\U0001FFFF☀-➿️‍]")

# About 400 tokens, under Haiku 5.5's 512-token cache minimum, so there is no cache_control.
SYSTEM = """You write the "Film Room" preview for one NFL game on a pick'em site where friends pick every game against the spread.

You get a JSON fact pack. Write about 120 words of plain text, in one or two short paragraphs, covering:
- the matchup angle: records, home/road splits, recent form, and head-to-head meetings if any are listed
- key injuries, naming the players listed and their status
- a read of the line and total: what the spread and over/under say about how the game is expected to go
- the weather, only if the pack includes it and it could matter (wind, rain, snow, cold)
Finish with exactly one sentence that starts with "Upset watch:" or "Lock of the week:".

Rules:
- Use only the facts in the pack. Never invent stats, players, streaks, trends, coaching notes or history that are not in it. If a fact is missing, leave the topic out instead of guessing.
- Describe the line; do not recommend bets, stakes, parlays or sportsbooks.
- Plain text only: no emojis, no markdown, no headings, no bullet points.
- Call teams by the names given."""


def kickoff_label(kickoff: str) -> str:
    """"Sun Nov 16, 1:00 PM ET"."""
    at = nfl_store.parse(kickoff).astimezone(ET)
    return f"{at:%a %b} {at.day}, {at.hour % 12 or 12}:{at:%M} {at:%p} ET"


def side(team: dict) -> dict:
    return {
        "team": team.get("name") or team["abbr"],
        "abbr": team["abbr"],
        "record": team.get("record"),
        "homeOrRoadRecord": team.get("split"),
        "lastFive": [f"{f['result']} {f['score']} {f['atVs']} {f['opponent']}" for f in team["form"]],
        "injuries": [
            {"player": i["name"], "position": i["position"], "status": i["status"], "injury": i["detail"]}
            for i in team["injuries"]
            if i["status"] in REPORTED
        ][:INJURIES_PER_TEAM],
    }


def fact_pack(view: dict) -> dict:
    """The facts the model may use, from game_view.payload's output."""
    game, lines = view["game"], view["game"]["lines"] or {}
    venue = game["venue"]
    weather = view["weather"]
    return {
        "week": game["week"],
        "kickoff": kickoff_label(game["kickoff"]),
        "away": side(view["away"]),
        "home": side(view["home"]),
        "venue": {"name": venue.get("name"), "city": venue.get("city"), "roof": venue.get("roof")},
        "line": {
            "favorite": lines.get("details"),
            "overUnder": lines.get("overUnder"),
            "awayMoneyline": lines.get("awayMoneyline"),
            "homeMoneyline": lines.get("homeMoneyline"),
        } if lines else None,
        "weather": weather and {
            "temperatureF": weather.get("temperature"),
            "windGustMph": weather.get("gust"),
            # Precipitation is left out: its units are unverified (game_info.py).
            "conditions": weather.get("description"),
        },
        "headToHead": [
            f"{m['season']} week {m['week']}: {m['away']} {m['awayScore']} @ {m['home']} {m['homeScore']}"
            for m in view["headToHead"]
        ],
    }


def digest(facts: dict) -> str:
    return hashlib.sha256(json.dumps(facts, sort_keys=True).encode()).hexdigest()


def prompt(facts: dict) -> str:
    return "Fact pack:\n" + json.dumps(facts, indent=2)


def generate(client, facts: dict) -> str | None:
    """The preview text, or None when the model refused or ran out of room."""
    resp = client.messages.create(
        model=MODEL,
        max_tokens=2048,  # thinking counts toward it; the text itself is ~200 tokens
        system=SYSTEM,
        output_config={"effort": "low"},
        messages=[{"role": "user", "content": prompt(facts)}],
    )
    if resp.stop_reason != "end_turn":
        return None
    text = "".join(b.text for b in resp.content if b.type == "text")
    return EMOJI.sub("", text).strip() or None


def get(game_id: str) -> dict | None:
    item = nfl_store.table().get_item(Key={"PK": f"GAME#{game_id}", "SK": "WRITEUP"}).get("Item")
    return nfl_store.plain(item) if item else None


def save(game_id: str, text: str, facts_hash: str, generated_at: str) -> None:
    nfl_store.table().put_item(Item={
        "PK": f"GAME#{game_id}", "SK": "WRITEUP",
        "text": text, "model": MODEL, "generatedAt": generated_at, "factsHash": facts_hash,
    })
