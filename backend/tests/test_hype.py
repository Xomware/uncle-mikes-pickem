import pytest

from tests.test_cron_tick import board, serve, tick  # noqa: F401  (tick is a fixture)

# Week 10 of 2026 from the recorded scoreboard and predictors, scored by hand:
# standalone 20 | spread 20 - 2|s| | total - 40 (max 15) | MQ / 5 | division 10
GOLDEN = {
    "401873064": (67.1, {"standalone": 20, "spread": 13, "total": 9.5, "matchupQuality": 14.6, "divGame": 10}),  # PIT @ CIN, SNF
    "401873053": (60.7, {"standalone": 20, "spread": 15, "total": 11.5, "matchupQuality": 14.2, "divGame": 0}),  # NE VS DET, Munich
    "401873052": (53.2, {"standalone": 20, "spread": 15, "total": 0.5, "matchupQuality": 7.7, "divGame": 10}),  # WSH @ NYG, TNF
    "401873065": (38.7, {"standalone": 20, "spread": 11, "total": 0, "matchupQuality": 7.7, "divGame": 0}),  # LAC @ BAL, MNF
    "401873058": (30.6, {"standalone": 0, "spread": 14, "total": 6.5, "matchupQuality": 10.1, "divGame": 0}),  # KC @ ATL, 1pm
    "401873056": (20.3, {"standalone": 0, "spread": 11, "total": 0.5, "matchupQuality": 8.8, "divGame": 0}),  # HOU @ CLE, 1pm
}


@pytest.fixture
def week10(store, tick, monkeypatch):
    serve(monkeypatch, tick, [board(10), board(11)])
    tick.handler({"force": True}, None)
    return {g["gameId"]: g for g in store.list_games(2026, 10)}


def test_week10_golden(week10):
    got = {gid: (g["hype"]["score"], g["hype"]["points"]) for gid, g in week10.items()}
    assert got == GOLDEN
    assert max(week10.values(), key=lambda g: g["hype"]["score"])["gameId"] == "401873064"


def test_components_are_the_raw_inputs(week10):
    assert week10["401873052"]["hype"]["components"] == {
        "standalone": True, "spread": -2.5, "total": 40.5, "matchupQuality": 38.687, "divGame": True,
    }


def test_hourly_refresh_keeps_the_daily_predictor(store, tick, week10, monkeypatch):
    calls = serve(monkeypatch, tick, [board(10), board(11)])
    tick.refresh(tick.datetime.now(), "hourly")
    assert not any("/predictor" in c for c in calls)
    snf = next(g for g in store.list_games(2026, 10) if g["gameId"] == "401873064")
    assert snf["hype"]["score"] == 67.1


def test_missing_inputs_score_zero():
    from lambdas.common.hype import hype

    tbd = {"away": {"abbr": "NYJ"}, "home": {"abbr": "BUF"}}
    assert hype(tbd, False) == {
        "components": {"standalone": False, "spread": None, "total": None, "matchupQuality": None, "divGame": True},
        "points": {"standalone": 0, "spread": 0, "total": 0, "matchupQuality": 0, "divGame": 10},
        "score": 10,
    }


def test_placeholder_kickoffs_are_never_standalone():
    from lambdas.common.hype import standalone_ids

    games = [
        {"gameId": "1", "kickoff": "2027-01-10T05:00:00Z", "timeValid": False},
        {"gameId": "2", "kickoff": "2027-01-10T18:00:00Z", "timeValid": True},
        {"gameId": "3", "kickoff": "2027-01-10T18:00:00Z", "timeValid": True},
        {"gameId": "4", "kickoff": "2027-01-11T01:20:00Z", "timeValid": True},
    ]
    assert standalone_ids(games) == {"4"}
