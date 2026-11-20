"""One member's season in a group, folded from the RESULT items and their own PICK items.

A void or pending game counts for nothing. A "tie" grade is a tie under the zero rule; under
the full rule a tie already grades "right". Streaks run in kickoff order across weeks; a
missed week has no picks, so it neither extends nor breaks one.
"""

from __future__ import annotations

DECIDED = ("right", "wrong", "tie")


def tally() -> dict[str, int]:
    return {g: 0 for g in DECIDED}


def member_stats(sub: str, results: list[dict], sheets: dict[int, dict], kickoffs: dict[str, str]) -> dict:
    """`results` are plain RESULT items in week order, `sheets` the member's PICK items by week,
    `kickoffs` every game's kickoff by gameId."""
    weeks, picks = [], []
    record, gow, teams = tally(), tally(), {}
    for r in results:
        row = r["members"].get(sub)
        if not row:
            continue
        weeks.append(
            {
                "week": r["week"],
                "status": r["status"],
                "weekly": row["weekly"],
                "place": row["place"],
                "field": len(r["members"]),
                "missed": row["missed"],
                "won": sub in r["winners"],
            }
        )
        decided = {gid: g for gid, g in row["games"].items() if g in DECIDED}
        for gid, g in decided.items():
            pick = sheets[r["week"]]["picks"][gid]
            picks.append((kickoffs.get(gid, ""), gid, pick["conf"], g))
            record[g] += 1
            teams.setdefault(pick["team"], tally())[g] += 1
        if r["gowGameId"] in decided:
            gow[decided[r["gowGameId"]]] += 1

    run = longest = 0
    for *_, g in sorted(picks):
        run = run + 1 if g == "right" else 0
        longest = max(longest, run)
    return {
        "weeks": weeks,
        "record": record,
        "points": {
            "earned": sum(conf for *_, conf, g in picks if g == "right"),
            "possible": sum(conf for *_, conf, _ in picks),
        },
        "streak": {"longest": longest, "current": run},
        "gow": gow,
        "teams": [{"team": t, **counts} for t, counts in sorted(teams.items())],
    }
