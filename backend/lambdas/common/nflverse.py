"""nflverse games.csv: finals and lines keyed by ESPN event id.

The second source that confirms ESPN finals (F7) and the 2026 replay's schedule
(F5). Rows come out in pickem-nfl's terms, so they compare directly with a GAME:
ESPN team codes, and the spread in ESPN's sign. nflverse's spread_line is
positive when the home team is favored; ESPN's is the home team's line,
negative when it is favored.

Data: nflverse (CC BY 4.0). Read from the release asset, not raw nfldata, which
has no license.
"""

from __future__ import annotations

import csv
import gzip
import io
import urllib.request

GAMES_URL = "https://github.com/nflverse/nflverse-data/releases/download/schedules/games.csv.gz"

# nflverse -> ESPN.
TEAM_ALIASES = {"LA": "LAR", "WAS": "WSH"}


def team(code: str) -> str:
    return TEAM_ALIASES.get(code, code)


def fetch() -> str:
    # The asset 302s to a signed release-assets URL; urlopen follows it.
    req = urllib.request.Request(GAMES_URL, headers={"User-Agent": "pickem.xomware.com"})
    with urllib.request.urlopen(req, timeout=30) as resp:
        return gzip.decompress(resp.read()).decode()


def num(raw: str) -> float | None:
    return float(raw) if raw else None


def games(text: str, season: int) -> dict[str, dict]:
    """The season's games keyed by ESPN event id."""
    out = {}
    for r in csv.DictReader(io.StringIO(text)):
        if r["season"] != str(season):
            continue
        result = num(r["result"])  # home score minus away score
        away, home = team(r["away_team"]), team(r["home_team"])
        spread = num(r["spread_line"])
        out[r["espn"]] = {
            "gameId": r["espn"],
            "nflverseId": r["game_id"],
            "gameType": r["game_type"],
            "week": int(r["week"]),
            "away": away,
            "home": home,
            "awayScore": None if result is None else int(r["away_score"]),
            "homeScore": None if result is None else int(r["home_score"]),
            "final": result is not None,
            "tie": result == 0,
            "winner": None if not result else (home if result > 0 else away),
            "spread": None if spread is None else -spread,
            "overUnder": num(r["total_line"]),
            "divGame": r["div_game"] == "1",
        }
    return out
