"""What each email says: template contexts built from items the mail sweep has read.

Pure functions, so each is tested without a table. The sweep adds `name` and
`group_name` (and the mailer `brand`, `site`, `unsubscribe_url`) on top.
"""

from __future__ import annotations


def place_label(place: str) -> str:
    """Standings places to words: "3" is "3rd", "1*" is "tied 1st"."""
    n = int(place.rstrip("*"))
    suffix = "th" if 10 <= n % 100 <= 20 else {1: "st", 2: "nd", 3: "rd"}.get(n % 10, "th")
    return ("tied " if place.endswith("*") else "") + f"{n}{suffix}"


def matchup(game: dict) -> str:
    return f"{game['away']['abbr']} @ {game['home']['abbr']}"


def score(outcome: dict | None) -> str:
    return f"{outcome['awayScore']}-{outcome['homeScore']}" if outcome else ""


def week_ctx(result: dict, games: list[dict], sheets: dict[str, dict], standings: dict | None, names: dict, sub: str) -> dict:
    """week_result.html for one member. `sheets` is the week's PICK items by sub, `games` the week in kickoff order."""
    row = result["members"][sub]
    mine = {} if row["missed"] else sheets[sub]["picks"]
    canceled = set(result["canceled"])
    gow_id = result["gowGameId"]
    grid, gow = [], None
    for g in games:
        gid, outcome, pick = g["gameId"], result["games"].get(g["gameId"]), mine.get(g["gameId"], {})
        cell = {
            "matchup": matchup(g),
            "score": score(outcome),
            "team": pick.get("team"),
            "conf": pick.get("conf"),
            "status": "void" if gid in canceled else row["games"].get(gid, "missed"),
            "gow": gid == gow_id,
        }
        grid.append(cell)
        if cell["gow"]:
            gow = {**cell, "winner": outcome and outcome["result"], "points": row["gow"]}

    rows = (standings or {}).get("rows", [])
    season = next(({**r, "place": place_label(r["place"])} for r in rows if r["member"] == sub), None)
    winners = result["winners"]
    return {
        "week": result["week"],
        "won": sub in winners,
        "missed": row["missed"],
        "score": row["weekly"],
        "place": place_label(row["place"]),
        "entrants": len(result["members"]),
        "winners": [{"name": "You" if s == sub else names[s], "tiebreak": sheets[s]["tiebreak"]} for s in winners],
        "winning_score": result["members"][winners[0]]["weekly"] if winners else None,
        "tiebreak_total": result["tiebreakTotal"],
        "grid": grid,
        "gow": gow,
        "season": season and {"place": season["place"], "total": season["total"], "gow": season["gow"], "of": len(rows)},
    }


def alive(entries: list[dict]) -> int:
    return sum(1 for e in entries if not e.get("eliminatedWeek"))


def death_ctx(entry: dict, week: int, teams: dict[str, str], entries: list[dict]) -> dict:
    """death_out.html and death_life.html. `teams` is the week RESULT's {team: W | L | T}; no team is a missed pick."""
    team = entry["picks"].get(str(week))
    return {
        "week": week,
        "label": entry["label"],
        "team": team,
        "outcome": {"L": "lost", "T": "tied", "W": "won"}.get(teams.get(team), "") if team else "",
        "lives_left": entry.get("livesLeft", 0),
        "alive": alive(entries),
    }


def revived_ctx(week: int, labels: list[str], entries: list[dict]) -> dict:
    return {"week": week, "labels": labels, "alive": alive(entries)}
