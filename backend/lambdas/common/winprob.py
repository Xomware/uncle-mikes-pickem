"""Monte Carlo win odds (PLAN.md F13). Pure: callers pass plain data and a seeded Random.

Model and its approximations: docs/features/uncle-mikes-pickem/ANALYTICS.md.
"""

from __future__ import annotations

import random
import statistics

from lambdas.common import grade, standings

SIMS = 10_000
# Member-game score additions one week sim may spend. A 20-member, 16-undecided-game week
# needs 3.2M at 10k sims; past the budget the sim count drops instead of the Lambda timing out.
WORK = 4_000_000
MIN_SIMS = 2_000
# The SD of an NFL game's total points around the closing over/under.
TOTAL_SIGMA = 13.5


def sims_for(members: int, games: int) -> int:
    if games == 0:
        return 1  # nothing left to draw: one pass is exact
    return max(MIN_SIMS, min(SIMS, WORK // max(1, members * games)))


def week(
    sheets: dict[str, dict],
    results: dict[str, str],
    open_games: dict[str, tuple[str, str, float]],
    gow_id: str | None,
    rules: dict,
    guesses: dict[str, int],
    total: int | None,
    over_under: float | None,
    rng: random.Random,
    sims: int,
) -> dict:
    """Simulate the undecided games of one group-week.

    sheets:     {sub: picks}, complete sheets only (a missed week can't win the pot)
    results:    the decided games, as grade.grade takes them
    open_games: {gameId: (away, home, P(home wins))} for each undecided game
    total:      the tiebreak game's final total, or None while it's undecided

    Returns pWin {sub: p}, root {sub: {gameId: {away, home}}} (P(win | that side wins), None
    when that side never won in the sims), and yearly: each sim's yearly score per sub, in
    `subs` order, for the season sim.
    """
    subs = sorted(sheets)
    gids = sorted(open_games)
    base = {s: grade.grade(sheets[s], results, gow_id, rules) for s in subs}

    # grade.grade is a sum over games, so an undecided game adds the same amount to a sheet
    # whatever the others do: grade each outcome once, then a sim only adds. Tested against
    # a full grade.grade per sim.
    def delta(s: str, gid: str, team: str, key: str) -> int:
        return grade.grade(sheets[s], results | {gid: team}, gow_id, rules)[key] - base[s][key]

    weekly_d = [[(delta(s, g, open_games[g][0], "weekly"), delta(s, g, open_games[g][1], "weekly")) for g in gids] for s in subs]
    gow_at = gids.index(gow_id) if gow_id in open_games else None
    gow_d = [
        (base[s]["gow"],) * 2 if gow_at is None else tuple(base[s]["gow"] + delta(s, gow_id, open_games[gow_id][i], "gow") for i in (0, 1))
        for s in subs
    ]
    p_home = [open_games[g][2] for g in gids]
    n = len(subs)

    wins = [0.0] * n
    seen = [[0, 0] for _ in gids]
    won_given = [[[0.0] * n, [0.0] * n] for _ in gids]
    yearly = []
    for _ in range(sims):
        sides = [int(rng.random() < p) for p in p_home]  # 1 = home wins
        weekly = [base[s]["weekly"] + sum(d[o] for d, o in zip(weekly_d[i], sides)) for i, s in enumerate(subs)]
        gow_side = 0 if gow_at is None else sides[gow_at]
        yearly.append([w + gow_d[i][gow_side] for i, w in enumerate(weekly)])

        # The MNF tiebreak: an undecided game's total is drawn around its over/under; with no
        # total to measure against, the tied members split.
        t = total
        if t is None and over_under is not None:
            t = max(0, round(rng.gauss(over_under, TOTAL_SIGMA)))
        board = dict(zip(subs, weekly))
        winners = standings.weekly_winners(board, guesses if t is not None else dict.fromkeys(subs, 0), t or 0)
        credit = 1 / len(winners) if winners else 0
        at = [subs.index(w) for w in winners]
        for g, side in enumerate(sides):
            seen[g][side] += 1
            for i in at:
                won_given[g][side][i] += credit
        for i in at:
            wins[i] += credit

    def given(g: int, side: int, i: int) -> float | None:
        return round(won_given[g][side][i] / seen[g][side], 4) if seen[g][side] else None

    return {
        "subs": subs,
        "sims": sims,
        "pWin": {s: round(wins[i] / sims, 4) for i, s in enumerate(subs)},
        "root": {s: {g: {"away": given(j, 0, i), "home": given(j, 1, i)} for j, g in enumerate(gids)} for i, s in enumerate(subs)},
        "yearly": yearly,
    }


def spread(scores: list[int]) -> tuple[float, float]:
    return statistics.fmean(scores), statistics.stdev(scores)


def season(
    known: dict[str, tuple[int, int]],
    history: dict[str, list[int]],
    open_week: dict | None,
    remaining: int,
    rng: random.Random,
    sims: int = SIMS,
) -> dict[str, dict]:
    """P(win the season) for each season member.

    known:     {sub: (yearly total, GOW points)} over the weeks no longer open
    history:   {sub: yearly week scores}, the same weeks, for the future-week model
    open_week: winprob.week's output for the open week, or None; season sim k takes that
               week's sim k, so this week's scores keep their joint distribution
    remaining: weeks after the open (or last graded) one

    Future picks are unknown, so each future week is drawn from the member's own mean/SD of
    past yearly week scores (pooled over the group under two weeks). Ties on the total go to
    known GOW points, then split.
    """
    subs = sorted(known)
    pooled = [s for scores in history.values() for s in scores]
    if len(pooled) < 2 and open_week:
        pooled = [y for row in open_week["yearly"] for y in row]
    fallback = spread(pooled) if len(pooled) > 1 else (0.0, 0.0)
    model = {s: spread(history[s]) if len(history.get(s, [])) > 1 else fallback for s in subs}
    at = {s: open_week["subs"].index(s) for s in subs if open_week and s in open_week["subs"]}

    wins = dict.fromkeys(subs, 0.0)
    for k in range(sims):
        totals = {s: known[s][0] for s in subs}
        if open_week:
            row = open_week["yearly"][k % len(open_week["yearly"])]
            # A season member with no sheet this week gets the missed score: lowest season sheet - 1.
            missed = min((row[i] for i in at.values()), default=1) - 1
            for s in subs:
                totals[s] += row[at[s]] if s in at else missed
        if remaining:
            for s in subs:
                mean, sd = model[s]
                totals[s] += round(rng.gauss(remaining * mean, remaining**0.5 * sd))
        best = max((totals[s], known[s][1]) for s in subs)
        top = [s for s in subs if (totals[s], known[s][1]) == best]
        for s in top:
            wins[s] += 1 / len(top)
    return {s: {"pWin": round(wins[s] / sims, 4), "mean": round(model[s][0], 2), "sd": round(model[s][1], 2)} for s in subs}
