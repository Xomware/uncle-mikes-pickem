from lambdas.common.standings import fill_missed, places, season, week_board, weekly_winners


def g(weekly, gow=0):
    return {"weekly": weekly, "yearly": weekly + gow, "gow": gow}


def test_places_share_with_star():
    assert places({"a": 10, "b": 12, "c": 10, "d": 3}) == {"b": "1", "a": "2*", "c": "2*", "d": "4"}


def test_missed_score_is_lowest_minus_one():
    assert fill_missed({"a": 50, "b": 40, "c": None}) == {"a": 50, "b": 40, "c": 39}
    assert fill_missed({"a": None, "b": None}) == {"a": 0, "b": 0}


def test_week_board_missed_on_both_boards_from_different_people():
    # Lowest weekly is b (40); lowest yearly is a (50 - 15 = 35).
    board = week_board({"a": g(50, -15), "b": g(40, 10)}, ["a", "b", "c"])
    assert board["c"] == {"weekly": 39, "yearly": 34, "gow": 0, "missed": True, "place": "3"}
    assert board["a"]["place"] == "1"


def test_late_joiner_gets_missed_score_for_earlier_weeks():
    w1 = week_board({"a": g(60), "b": g(70)}, ["a", "b", "late"])
    w2 = week_board({"a": g(60), "b": g(70), "late": g(80)}, ["a", "b", "late"])
    assert w1["late"]["weekly"] == 59
    table = {r["member"]: r["total"] for r in season([w1, w2])}
    assert table == {"a": 120, "b": 140, "late": 139}


def test_weekly_winner_by_mnf_total():
    weekly = {"a": 100, "b": 100, "c": 90}
    assert weekly_winners(weekly, {"a": 40, "b": 47, "c": 45}, 45) == ["b"]


def test_exact_tiebreak_tie_splits():
    weekly = {"a": 100, "b": 100}
    assert weekly_winners(weekly, {"a": 40, "b": 50}, 45) == ["a", "b"]


def test_non_submitter_never_wins():
    weekly = fill_missed({"a": 100, "b": None})
    assert weekly_winners(weekly, {"a": 10}, 45) == ["a"]
    assert weekly_winners({"a": 0}, {}, 45) == []


def test_season_gow_breaks_total_tie():
    w1 = {"a": {"yearly": 50, "gow": 10}, "b": {"yearly": 50, "gow": -5}, "c": {"yearly": 60, "gow": 0}}
    rows = season([w1])
    assert [(r["member"], r["place"]) for r in rows] == [("c", "1"), ("a", "2"), ("b", "3")]


def test_season_shares_place_when_total_and_gow_tie():
    w1 = {"a": {"yearly": 50, "gow": 10}, "b": {"yearly": 50, "gow": 10}}
    assert [r["place"] for r in season([w1])] == ["1*", "1*"]
