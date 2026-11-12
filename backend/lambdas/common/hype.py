"""Game-of-the-week hype: a plain sum of points per stored component.

    standalone      20  the only game in its kickoff slot (TNF/SNF/MNF, international)
    spread       0..20  20 at pick'em, minus 2 per point of spread
    total        0..15  one per point of over/under above 40
    matchupQuality 0..20  ESPN predictor's 0-100 scale, divided by 5
    divGame         10  division rivals

ESPN marks every broadcast "national", even regional CBS/Fox windows, so the
slot is read from kickoff times instead.
"""

from __future__ import annotations

from collections import Counter

# ESPN codes.
DIVISIONS = [
    {"BUF", "MIA", "NE", "NYJ"}, {"BAL", "CIN", "CLE", "PIT"},
    {"HOU", "IND", "JAX", "TEN"}, {"DEN", "KC", "LAC", "LV"},
    {"DAL", "NYG", "PHI", "WSH"}, {"CHI", "DET", "GB", "MIN"},
    {"ATL", "CAR", "NO", "TB"}, {"ARI", "LAR", "SEA", "SF"},
]


def standalone_ids(games: list[dict]) -> set[str]:
    """Games alone in their kickoff slot. Placeholder (TBD) kickoffs never count."""
    slots = Counter(g["kickoff"] for g in games if g["timeValid"])
    return {g["gameId"] for g in games if g["timeValid"] and slots[g["kickoff"]] == 1}


def components(game: dict, standalone: bool) -> dict:
    lines = game.get("lines") or {}
    teams = {game["away"]["abbr"], game["home"]["abbr"]}
    return {
        "standalone": standalone,
        "spread": lines.get("spread"),
        "total": lines.get("overUnder"),
        "matchupQuality": game.get("matchupQuality"),
        "divGame": any(teams <= d for d in DIVISIONS),
    }


def points(c: dict) -> dict:
    return {
        "standalone": 20 if c["standalone"] else 0,
        "spread": 0 if c["spread"] is None else max(0, 20 - 2 * abs(c["spread"])),
        "total": 0 if c["total"] is None else min(15, max(0, c["total"] - 40)),
        "matchupQuality": 0 if c["matchupQuality"] is None else round(c["matchupQuality"] / 5, 1),
        "divGame": 10 if c["divGame"] else 0,
    }


def hype(game: dict, standalone: bool) -> dict:
    c = components(game, standalone)
    p = points(c)
    return {"components": c, "points": p, "score": round(sum(p.values()), 1)}
