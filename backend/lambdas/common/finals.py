"""ESPN final -> provisional; nflverse agreement -> confirmed (BRAINSTORM.md 2A, PLAN.md 7.2).

The GAME fields this owns, beside ESPN's status, scores and winner:
    finalAt      the first tick ESPN reported the game completed
    confirmedBy  ["espn"] while provisional, ["espn", "nflverse"] once confirmed
    flag         why the game needs the admin: nflverse disagrees, or no confirmation in 6 h
"""

from __future__ import annotations

from datetime import datetime, timedelta

from lambdas.common.nfl_store import iso, parse

UNCONFIRMED_AFTER = timedelta(hours=6)


def confirmed(game: dict) -> bool:
    return "nflverse" in (game.get("confirmedBy") or [])


def settled(game: dict) -> bool:
    """Nothing left to poll for: confirmed, or flagged for the admin."""
    return confirmed(game) or bool(game.get("flag"))


def check(game: dict, verse: dict | None, now: datetime) -> dict:
    """Fields to set on a completed, unconfirmed game, given its nflverse row (or None)."""
    out = {"finalAt": game.get("finalAt") or iso(now), "confirmedBy": ["espn"]}
    if verse and verse["final"]:
        theirs = (verse["awayScore"], verse["homeScore"])
        if theirs == (game["awayScore"], game["homeScore"]):
            # A later agreement clears a disagreement: ESPN corrected its final.
            return {**out, "confirmedBy": ["espn", "nflverse"], "flag": None}
        return {**out, "flag": f"nflverse has {theirs[0]}-{theirs[1]}, ESPN {game['awayScore']}-{game['homeScore']}"}
    if now - parse(out["finalAt"]) >= UNCONFIRMED_AFTER:
        return {**out, "flag": "nflverse hasn't confirmed it in 6 h"}
    return out
