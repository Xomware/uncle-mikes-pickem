from lambdas.common.stats import member_stats

KICKOFFS = {"a": "2027-09-07T17:00Z", "b": "2027-09-07T20:00Z", "c": "2027-09-14T17:00Z", "d": "2027-09-14T20:00Z"}


def result(week, games, gow, winners=(), place="1", missed=False, weekly=0):
    row = {"weekly": weekly, "place": place, "missed": missed, "games": games}
    return {"week": week, "status": "final", "gowGameId": gow, "winners": list(winners), "members": {"me": row, "x": {}}}


def sheet(**picks):
    return {"picks": {gid: {"team": team, "conf": conf} for gid, (team, conf) in picks.items()}}


def test_folds_a_season():
    results = [
        # Week 1: b (conf 2) wrong, a (conf 1) right; a is the GOW. "a" kicks off first.
        result(1, {"a": "right", "b": "wrong"}, "a", winners=["me"], weekly=1),
        # Week 2: c right, d void after a cancel.
        result(2, {"c": "right", "d": "void"}, "d", place="2", weekly=2),
        result(3, {}, "c", place="3", missed=True),
    ]
    sheets = {1: sheet(a=("KC", 1), b=("KC", 2)), 2: sheet(c=("BUF", 2), d=("NYJ", 1))}
    out = member_stats("me", results, sheets, KICKOFFS)

    assert [(w["week"], w["place"], w["field"], w["won"], w["missed"]) for w in out["weeks"]] == [
        (1, "1", 2, True, False),
        (2, "2", 2, False, False),
        (3, "3", 2, False, True),
    ]
    assert out["record"] == {"right": 2, "wrong": 1, "tie": 0}
    assert out["points"] == {"earned": 3, "possible": 5}
    # right (a), wrong (b), right (c): the void d and the missed week change nothing.
    assert out["streak"] == {"longest": 1, "current": 1}
    assert out["gow"] == {"right": 1, "wrong": 0, "tie": 0}
    assert out["teams"] == [
        {"team": "BUF", "right": 1, "wrong": 0, "tie": 0, "won": 2, "lost": 0},
        {"team": "KC", "right": 1, "wrong": 1, "tie": 0, "won": 1, "lost": 2},
    ]
    assert out["confidence"] == [
        {"conf": 1, "right": 1, "wrong": 0, "tie": 0},
        {"conf": 2, "right": 1, "wrong": 1, "tie": 0},
    ]


def test_streak_runs_in_kickoff_order_across_weeks():
    results = [result(1, {"b": "right", "a": "wrong"}, "a"), result(2, {"c": "right", "d": "tie"}, "c")]
    sheets = {1: sheet(a=("A", 1), b=("B", 2)), 2: sheet(c=("C", 2), d=("D", 1))}
    out = member_stats("me", results, sheets, KICKOFFS)
    # a wrong, b right, c right, d tie: a tie breaks the run.
    assert out["streak"] == {"longest": 2, "current": 0}
    assert out["record"]["tie"] == 1
    # A tie neither earns nor costs its confidence.
    assert next(t for t in out["teams"] if t["team"] == "D") == {"team": "D", "right": 0, "wrong": 0, "tie": 1, "won": 0, "lost": 0}


def test_member_missing_from_a_result_is_skipped():
    out = member_stats("new", [result(1, {"a": "right"}, "a")], {}, KICKOFFS)
    assert out["weeks"] == [] and out["points"] == {"earned": 0, "possible": 0}
