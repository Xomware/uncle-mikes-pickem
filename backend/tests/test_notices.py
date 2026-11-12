import pytest

from lambdas.common import notices

GAMES = [
    {"gameId": "1", "away": {"abbr": "BUF"}, "home": {"abbr": "MIA"}},
    {"gameId": "2", "away": {"abbr": "KC"}, "home": {"abbr": "BAL"}},
    {"gameId": "3", "away": {"abbr": "SF"}, "home": {"abbr": "SEA"}},
]
RESULT = {
    "week": 5,
    "canceled": ["3"],
    "gowGameId": "2",
    "tiebreakTotal": 37,
    "winners": ["a"],
    "games": {"1": {"awayScore": 24, "homeScore": 27, "result": "MIA"}, "2": {"awayScore": 20, "homeScore": 17, "result": "KC"}},
    "members": {
        "a": {"weekly": 3, "yearly": 6, "gow": 2, "missed": False, "place": "1", "games": {"1": "right", "2": "right"}},
        "b": {"weekly": 0, "yearly": -2, "gow": -2, "missed": False, "place": "2*", "games": {"1": "wrong", "2": "wrong"}},
        "c": {"weekly": 0, "yearly": -3, "gow": 0, "missed": True, "place": "2*", "games": {}},
    },
}
SHEETS = {
    "a": {"picks": {"1": {"team": "MIA", "conf": 1}, "2": {"team": "KC", "conf": 2}}, "tiebreak": 40},
    "b": {"picks": {"1": {"team": "BUF", "conf": 1}, "2": {"team": "BAL", "conf": 2}}, "tiebreak": 30},
}
STANDINGS = {"rows": [{"member": "a", "total": 50, "gow": 4, "place": "1"}, {"member": "b", "total": 9, "gow": -2, "place": "2"}]}
NAMES = {"a": "Ann", "b": "Bo", "c": "Cy"}


@pytest.mark.parametrize("place,label", [
    ("1", "1st"), ("2", "2nd"), ("3*", "tied 3rd"), ("4", "4th"), ("11", "11th"), ("12*", "tied 12th"), ("21", "21st"),
])
def test_place_label(place, label):
    assert notices.place_label(place) == label


def test_winner_gets_grid_gow_and_season():
    ctx = notices.week_ctx(RESULT, GAMES, SHEETS, STANDINGS, NAMES, "a")
    assert (ctx["won"], ctx["score"], ctx["place"], ctx["entrants"]) == (True, 3, "1st", 3)
    assert ctx["winners"] == [{"name": "You", "tiebreak": 40}]
    assert (ctx["winning_score"], ctx["tiebreak_total"]) == (3, 37)
    assert [(g["matchup"], g["score"], g["team"], g["conf"], g["status"], g["gow"]) for g in ctx["grid"]] == [
        ("BUF @ MIA", "24-27", "MIA", 1, "right", False),
        ("KC @ BAL", "20-17", "KC", 2, "right", True),
        ("SF @ SEA", "", None, None, "void", False),
    ]
    assert (ctx["gow"]["winner"], ctx["gow"]["points"]) == ("KC", 2)
    assert ctx["season"] == {"place": "1st", "total": 50, "gow": 4, "of": 2}


def test_loser_sees_a_negative_gow_and_a_shared_place():
    ctx = notices.week_ctx(RESULT, GAMES, SHEETS, STANDINGS, NAMES, "b")
    assert (ctx["won"], ctx["place"], ctx["gow"]["points"]) == (False, "tied 2nd", -2)


def test_missed_week_and_weekly_only_member():
    ctx = notices.week_ctx(RESULT, GAMES, SHEETS, STANDINGS, NAMES, "c")
    assert ctx["missed"] and ctx["season"] is None
    assert [g["status"] for g in ctx["grid"]] == ["missed", "missed", "void"]
    assert ctx["gow"]["team"] is None
