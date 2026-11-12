"""Checks against the organizer's real 2026 sheet after Week 9 (fixtures/sheet-2026-w9.json).

The sheet has scores, not pick sheets, so these assert what it can prove: missed-week
scores, shared places, season sums and order, the GOW arithmetic, and the death grid.
"""

import json
from collections import defaultdict
from pathlib import Path

from lambdas.common.death import fold
from lambdas.common.standings import fill_missed, places, season

SHEET = json.loads((Path(__file__).parents[2] / "fixtures" / "sheet-2026-w9.json").read_text())
WEEKLY = SHEET["weekly_w9"]
YEARLY = SHEET["yearly_through_w9"]
GRID = SHEET["death_grid"]

# Six rows sit at 79 with the lowest other score at 80; the four of them on the yearly
# board all have 64 for W9, one under the lowest submitter's yearly 65. That pair is
# the missed-week rule on both boards, so these are the Week 9 non-submitters.
MISSED = {r["member"] for r in WEEKLY if r["points"] == 79}


def test_week9_missed_score_on_both_boards():
    assert len(MISSED) == 6
    weekly = fill_missed({r["member"]: None if r["member"] in MISSED else r["points"] for r in WEEKLY})
    assert weekly == {r["member"]: r["points"] for r in WEEKLY}

    yearly = fill_missed({r["member"]: None if r["member"] in MISSED else r["weeks"][8] for r in YEARLY})
    assert yearly == {r["member"]: r["weeks"][8] for r in YEARLY}
    assert {yearly[m] for m in MISSED if m in yearly} == {64}


def test_week9_places():
    got = places({r["member"]: r["points"] for r in WEEKLY})
    for r in WEEKLY:
        assert got[r["member"]].rstrip("*") == r["place"].rstrip("*")
    assert got["m28"] == "1*" and got["m03"] == "1*"  # six-way tie at 120
    assert got["m02"] == "47"  # alone at 80


def test_week9_gow_arithmetic():
    # yearly - weekly is +c for a right GOW pick, -c for a wrong one, never 0 for a submitter.
    weekly = {r["member"]: r["points"] for r in WEEKLY}
    for r in YEARLY:
        if r["member"] in MISSED:
            continue
        diff = r["weeks"][8] - weekly[r["member"]]
        assert diff != 0
        if diff > 0:
            assert weekly[r["member"]] >= diff


def test_season_totals_and_order():
    boards = [{r["member"]: {"yearly": r["weeks"][w], "gow": 0} for r in YEARLY} for w in range(9)]
    rows = season(boards)
    totals = {r["member"]: r["total"] for r in YEARLY}
    assert {r["member"]: r["total"] for r in rows} == totals
    # Only W9's GOW points are recoverable from the sheet, so the ranking runs on totals
    # alone, where the sheet's shared places (15, 19, 24, 29) must come out the same.
    assert [r["member"] for r in rows] == [r["member"] for r in YEARLY]
    assert [r["place"].rstrip("*") for r in rows] == [str(r["place"]) for r in YEARLY]


def outcomes_from_grid():
    """A team's result per week, read off whether its pickers made the next week."""
    seen = defaultdict(set)
    for e in GRID:
        for week, team in enumerate(e["picks"], 1):
            survived = week < len(e["picks"]) or not e["eliminated"]
            seen[week, team].add("W" if survived else "L")
    return seen


def test_death_grid_is_consistent_with_one_life_and_no_revive():
    # Every entry on the same team in the same week shares its fate: one loss is
    # elimination (second life off), and no week took out everyone left.
    assert all(len(v) == 1 for v in outcomes_from_grid().values())
    for e in GRID:
        assert len(set(e["picks"])) == len(e["picks"]), e["entry"]


def test_death_fold_reproduces_grid():
    results = defaultdict(dict)
    for (week, team), (outcome,) in outcomes_from_grid().items():
        results[week][team] = outcome
    entries = {e["entry"]: dict(enumerate(e["picks"], 1)) for e in GRID}
    out = fold(entries, dict(results), [])
    for e in GRID:
        expected = len(e["picks"]) if e["eliminated"] else None
        assert out["entries"][e["entry"]]["eliminatedWeek"] == expected, e["entry"]
    alive = [e["entry"] for e in GRID if not e["eliminated"]]
    assert alive == ["d01", "d02"]
    assert out["winners"] == []  # two left after Week 9, pool still running

