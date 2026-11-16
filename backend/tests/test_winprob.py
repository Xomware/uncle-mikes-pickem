import random

import pytest

from lambdas.common import grade, odds, winprob
from lambdas.common.rules import DEFAULTS

GAMES = {"g1": ("NYJ", "BUF"), "g2": ("KC", "DEN"), "g3": ("LV", "LAC")}


def sheet(*picks):
    return {gid: {"team": team, "conf": conf} for gid, (team, conf) in zip(GAMES, picks)}


def run(sheets, results=None, p=None, gow="g2", guesses=None, total=None, ou=44.5, sims=4000, seed=7):
    undecided = {g: (*GAMES[g], (p or {}).get(g, 0.5)) for g in GAMES if g not in (results or {})}
    return winprob.week(
        sheets, results or {}, undecided, gow, DEFAULTS, guesses or dict.fromkeys(sheets, 40), total, ou, random.Random(seed), sims
    )


def test_moneyline_is_devigged():
    p, source = odds.home_win({"homeMoneyline": -150, "awayMoneyline": 130, "spread": -3})
    assert source == "moneyline"
    assert p == pytest.approx(0.6 / (0.6 + 100 / 230))


def test_spread_falls_back_to_a_normal_margin():
    p, source = odds.home_win({"spread": -3.0, "homeMoneyline": None})
    assert source == "spread"
    assert p == pytest.approx(0.5871, abs=1e-3)  # Phi(3 / 13.5)
    assert odds.home_win({"spread": 3.0})[0] == pytest.approx(1 - p)
    assert odds.home_win(None) == (0.5, "even")


def test_a_decided_week_is_certain():
    sheets = {"a": sheet(("BUF", 3), ("KC", 2), ("LV", 1)), "b": sheet(("NYJ", 3), ("KC", 2), ("LV", 1))}
    out = run(sheets, results={"g1": "BUF", "g2": "KC", "g3": "LV"}, total=40, sims=winprob.sims_for(2, 0))
    assert out["pWin"] == {"a": 1.0, "b": 0.0}
    assert out["root"] == {"a": {}, "b": {}}


def test_a_certain_game_gives_probability_one():
    # b can only win by g1 going NYJ; at P(home) = 1 it never does.
    sheets = {"a": sheet(("BUF", 3), ("KC", 2), ("LV", 1)), "b": sheet(("NYJ", 3), ("KC", 2), ("LV", 1))}
    out = run(sheets, p={"g1": 1.0})
    assert out["pWin"] == {"a": 1.0, "b": 0.0}
    assert out["root"]["a"]["g1"] == {"away": None, "home": 1.0}


def test_seeded_sims_repeat_and_sum_to_one():
    sheets = {"a": sheet(("BUF", 3), ("KC", 2), ("LV", 1)), "b": sheet(("NYJ", 1), ("DEN", 3), ("LAC", 2)), "c": sheet(("BUF", 1), ("DEN", 2), ("LV", 3))}
    first = run(sheets, p={"g1": 0.7, "g2": 0.4, "g3": 0.55})
    assert first == run(sheets, p={"g1": 0.7, "g2": 0.4, "g3": 0.55})
    assert sum(first["pWin"].values()) == pytest.approx(1, abs=1e-3)
    assert first != run(sheets, p={"g1": 0.7, "g2": 0.4, "g3": 0.55}, seed=8)


def test_rooting_follows_the_pick():
    sheets = {"a": sheet(("BUF", 3), ("KC", 2), ("LV", 1)), "b": sheet(("NYJ", 3), ("KC", 2), ("LV", 1))}
    root = run(sheets)["root"]
    # Only g1 separates them: whoever g1 favours wins outright.
    assert root["a"]["g1"] == {"away": 0.0, "home": 1.0}
    assert root["b"]["g1"] == {"away": 1.0, "home": 0.0}


def test_tie_on_points_goes_to_the_closer_guess_or_splits():
    same = sheet(("BUF", 3), ("KC", 2), ("LV", 1))
    sheets = {"a": same, "b": same}
    assert run(sheets, guesses={"a": 30, "b": 60}, total=31)["pWin"] == {"a": 1.0, "b": 0.0}
    assert run(sheets, guesses={"a": 40, "b": 40})["pWin"] == {"a": 0.5, "b": 0.5}
    # Undecided MNF with no over/under: nothing to measure against, so the tie splits.
    assert run(sheets, guesses={"a": 30, "b": 60}, ou=None)["pWin"] == {"a": 0.5, "b": 0.5}
    # Drawn around 44.5 with SD 13.5, 60 is closer than 30 a little under half the time.
    p = run(sheets, guesses={"a": 30, "b": 60})["pWin"]["b"]
    assert 0.4 < p < 0.5


def test_sim_scores_match_a_full_grade():
    sheets = {"a": sheet(("BUF", 3), ("KC", 2), ("LV", 1)), "b": sheet(("NYJ", 1), ("DEN", 3), ("LAC", 2))}
    results = {"g3": "LAC"}
    out = run(sheets, results=results, sims=200)
    yearly = {tuple(row) for row in out["yearly"]}
    # Every combination of g1 and g2 outcomes, graded whole by grade.grade.
    expect = set()
    for g1 in GAMES["g1"]:
        for g2 in GAMES["g2"]:
            full = results | {"g1": g1, "g2": g2}
            expect.add(tuple(grade.grade(sheets[s], full, "g2", DEFAULTS)["yearly"] for s in out["subs"]))
    assert yearly == expect


def test_sim_budget():
    assert winprob.sims_for(20, 16) == 10_000
    assert winprob.sims_for(100, 16) == 2_500
    assert winprob.sims_for(500, 16) == winprob.MIN_SIMS
