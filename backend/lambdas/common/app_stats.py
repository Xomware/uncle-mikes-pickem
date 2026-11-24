"""App-wide stats for a season, rebuilt beside LEADERBOARD in the same pass (issue #127).

    STATS / S2026   pick accuracy, groups ranked, per-team totals and the biggest upsets

Every turned-in sheet in every live group counts, so a player in two groups counts twice.
Only decided picks (right, wrong, tie) count; pending and void ones don't. Averages and
percentages stay out of the item (DynamoDB wants Decimals): it carries the counts, and
readers divide.
"""

from __future__ import annotations

from fractions import Fraction

PK = "STATS"
DECIDED = {"right": "correct", "wrong": "wrong", "tie": "ties"}
UPSETS = 10


def tally() -> dict:
    return {"correct": 0, "wrong": 0, "ties": 0}


def competition_ranks(rows: list[dict], key) -> list[dict]:
    """`rows` already sorted by `key` descending; equal keys share a rank."""
    out = []
    for i, r in enumerate(rows):
        same = out and key(r) == key(rows[i - 1])
        out.append({**r, "rank": out[-1]["rank"] if same else i + 1})
    return out


def build(groups: list[tuple[str, list[dict], dict[int, dict]]], season: int) -> dict:
    """STATS' body from (groupId, RESULTs, {week: {sub: PICK item}}) for each group."""
    overall, weeks, teams, games, ranked, everyone = tally(), {}, {}, {}, [], set()
    for gid, found, sheets in groups:
        players, points, count = set(), 0, 0
        for r in found:
            week = weeks.setdefault(r["week"], {"week": r["week"], **tally(), "sheets": 0})
            for sub, row in r["members"].items():
                if row["missed"]:
                    continue
                players.add(sub)
                points += row["weekly"]
                count += 1
                week["sheets"] += 1
                picks = sheets.get(r["week"], {}).get(sub, {}).get("picks", {})
                for game_id, mark in row["games"].items():
                    if mark not in DECIDED or game_id not in picks:
                        continue
                    pick = picks[game_id]
                    overall[DECIDED[mark]] += 1
                    week[DECIDED[mark]] += 1
                    team = teams.setdefault(pick["team"], {"team": pick["team"], "picks": 0, **tally(), "points": 0})
                    team["picks"] += 1
                    team[DECIDED[mark]] += 1
                    team["points"] += pick["conf"] if mark == "right" else 0
                    outcome = r["games"].get(game_id)
                    if mark != "tie" and outcome:
                        game = games.setdefault((r["week"], game_id), {"week": r["week"], "gameId": game_id, "outcome": outcome, "picked": {}})
                        game["picked"][pick["team"]] = game["picked"].get(pick["team"], 0) + 1
        everyone |= players
        if count:
            ranked.append({"groupId": gid, "players": len(players), "sheets": count, "points": points})

    def avg(g: dict) -> Fraction:
        return Fraction(g["points"], g["sheets"])

    ranked.sort(key=lambda g: (-avg(g), -g["sheets"], g["groupId"]))
    return {
        "season": season,
        "week": max(weeks, default=0),
        "players": len(everyone),
        "accuracy": overall,
        "weeks": [weeks[w] for w in sorted(weeks)],
        "groups": competition_ranks(ranked, avg),
        "teams": sorted(teams.values(), key=lambda t: (-t["picks"], -t["points"], t["team"])),
        "upsets": upsets(games.values()),
    }


def upsets(games) -> list[dict]:
    """Games most of the field picked the loser of, the most lopsided first."""
    out = []
    for g in games:
        o = g["outcome"]
        winner = o["result"]
        picks = sum(g["picked"].values())
        on_loser = picks - g["picked"].get(winner, 0)
        if 2 * on_loser <= picks:
            continue
        loser = max((t for t in g["picked"] if t != winner), key=lambda t: g["picked"][t])
        out.append(
            {
                "week": g["week"],
                "gameId": g["gameId"],
                "winner": winner,
                "loser": loser,
                "winnerScore": max(o["awayScore"], o["homeScore"]),
                "loserScore": min(o["awayScore"], o["homeScore"]),
                "picks": picks,
                "onLoser": on_loser,
            }
        )
    out.sort(key=lambda u: (-Fraction(u["onLoser"], u["picks"]), -u["picks"], u["week"], u["gameId"]))
    return out[:UPSETS]
