"""Grade one member's pick-em week. Rules: docs/RULES.md "Weekly pick-em" and "Game of the Week".

picks:   {gameId: {"team": str, "conf": int}}
results: {gameId: winning team | TIE | CANCELED}; a game not in results hasn't finished.
"""

from __future__ import annotations

TIE = "tie"
CANCELED = "canceled"


def validate_sheet(picks: dict[str, dict], games: dict[str, tuple[str, str]], canceled: set[str]) -> None:
    """Every non-canceled game picked for one of its teams, confidences exactly 1..N."""
    open_games = set(games) - canceled
    if set(picks) != open_games:
        raise ValueError("pick every non-canceled game, and only those")
    for gid, pick in picks.items():
        if pick["team"] not in games[gid]:
            raise ValueError(f"{pick['team']} is not playing in game {gid}")
    if sorted(p["conf"] for p in picks.values()) != list(range(1, len(open_games) + 1)):
        raise ValueError(f"confidences must be 1..{len(open_games)}, each used once")


def status(pick: dict, result: str | None, rules: dict) -> str:
    if result is None:
        return "pending"
    if result == CANCELED:
        return "void"
    if result == TIE:
        return "right" if rules["pickemTie"] == "full" else "tie"
    return "right" if pick["team"] == result else "wrong"


def grade(picks: dict[str, dict], results: dict[str, str], gow_id: str, rules: dict) -> dict:
    games = {gid: status(pick, results.get(gid), rules) for gid, pick in picks.items()}
    weekly = sum(picks[gid]["conf"] for gid, s in games.items() if s == "right")
    gow_conf = picks[gow_id]["conf"] if gow_id in picks else 0
    # A right GOW pick is already in `weekly` once; the yearly score counts it again.
    gow = {"right": gow_conf, "wrong": -gow_conf}.get(games.get(gow_id), 0)
    return {"weekly": weekly, "yearly": weekly + gow, "gow": gow, "games": games}
