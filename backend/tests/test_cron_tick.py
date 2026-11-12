import copy
import json
from datetime import datetime, timezone
from pathlib import Path

import boto3
import pytest
from boto3.dynamodb.conditions import Key

from tests.conftest import create_table

FIXTURES = Path(__file__).parent / "fixtures" / "espn"
# Thursday of Week 10, before TNF (2026-11-13T01:15Z).
NOW = datetime(2026, 11, 12, 18, 31, tzinfo=timezone.utc)


def board(week):
    return json.loads((FIXTURES / f"scoreboard-2026-w{week}.json").read_text())


@pytest.fixture
def tick(store, monkeypatch):
    from lambdas.cron_tick import handler

    monkeypatch.setenv("APP_TABLE", "app")
    create_table("app")
    monkeypatch.setattr(handler, "dynamodb", boto3.resource("dynamodb"))
    return handler


def serve(monkeypatch, tick, boards, status=200):
    """espn.get serving the default scoreboard as boards[0], ?week=N from boards, and
    recorded predictors; a game with no predictor fixture is a 404."""
    calls = []

    def get(url):
        calls.append(url)
        if status != 200:
            return status, b"forbidden"
        if url.endswith("/predictor"):
            path = FIXTURES / f"predictor-{url.split('/events/')[1].split('/')[0]}.json"
            return (200, path.read_bytes()) if path.exists() else (404, b"{}")
        week = int(url.split("week=")[1].split("&")[0]) if "week=" in url else boards[0]["week"]["number"]
        return 200, json.dumps(next(b for b in boards if b["week"]["number"] == week)).encode()

    monkeypatch.setattr(tick.espn, "get", get)
    monkeypatch.setattr(tick, "datetime", type("dt", (datetime,), {"now": staticmethod(lambda tz=None: NOW)}))
    return calls


def poll_rows():
    table = boto3.resource("dynamodb").Table("ops")
    return table.query(KeyConditionExpression=Key("PK").eq("POLL#cron_tick"))["Items"]


def game(kickoff, completed=False):
    return {"kickoff": kickoff, "completed": completed}


def test_mode_gating(tick):
    choose_mode = tick.choose_mode
    tnf = [game("2026-11-13T01:15:00Z")]
    at = lambda h, m: datetime(2026, 11, 13, h, m, tzinfo=timezone.utc)  # noqa: E731
    assert choose_mode(at(0, 31), tnf, False) is None
    assert choose_mode(at(1, 1), tnf, False) == "hourly"
    assert choose_mode(at(1, 3), tnf, False) == "live"
    confirmed = {**game("2026-11-13T01:15:00Z", completed=True), "confirmedBy": ["espn", "nflverse"]}
    assert choose_mode(at(1, 3), [confirmed], False) is None
    # A game that never finished stops holding the window 6 h after kickoff.
    assert choose_mode(at(7, 15), tnf, False) is None
    assert choose_mode(at(0, 31), [], True) == "force"


def test_target_weeks(tick):
    target_weeks = tick.target_weeks
    assert target_weeks(2, 10, "hourly") == [10, 11]
    assert target_weeks(2, 10, "live") == [10]
    assert target_weeks(2, 18, "force") == [18]
    assert target_weeks(1, 3, "hourly") == [1]
    assert target_weeks(3, 1, "hourly") == []


def test_game_fields_keep_espn_spread_sign(tick):
    events = {e["id"]: e for e in board(10)["events"]}
    tnf = tick.game_fields(events["401873052"])
    assert tnf["kickoff"] == "2026-11-13T01:15:00Z"
    assert (tnf["away"]["abbr"], tnf["home"]["abbr"]) == ("WSH", "NYG")
    assert tnf["lines"] == {
        "provider": "DraftKings", "details": "NYG -2.5", "spread": -2.5, "overUnder": 40.5,
        "homeMoneyline": -135, "awayMoneyline": 114,
    }
    assert tnf["broadcasts"] == ["Prime Video"]
    # KC is the away favorite at ATL: ESPN gives the home line, +3.
    assert tick.game_fields(events["401873058"])["lines"]["spread"] == 3.0


def test_force_refreshes_current_and_next_week(tick, store, monkeypatch):
    calls = serve(monkeypatch, tick, [board(10), board(11)])
    out = tick.handler({"force": True}, None)
    assert out == {
        "mode": "force", "season": 2026, "weeks": [10, 11], "games": 9,
        # No predictor fixtures recorded for Week 11.
        "predictorMissing": ["401873066", "401873077", "401873078"],
        "flagged": [],
        "finalsChanged": [],
        # Thursday is past Week 10's GOW deadline, but no groups exist.
        "gowAuto": [],
        "regraded": {},
    }
    # The default board doubles as Week 10's.
    assert len([c for c in calls if "/scoreboard" in c]) == 2

    assert store.current_week() == (2026, 10)
    w10 = store.get_week(2026, 10)
    assert w10["lockAt"] == "2026-11-13T01:15:00Z"
    assert w10["tiebreakGameId"] == "401873065"  # MNF
    assert store.get_week(2026, 11)["tiebreakGameId"] == "401873078"
    assert len(store.list_games(2026, 10)) == 6

    [row] = poll_rows()
    assert row["mode"] == "force" and row["games"] == 9 and "ttl" in row


def test_tiebreak_on_same_kickoff_takes_higher_event_id(tick, store):
    games = [tick.game_fields(e) for e in board(18)["events"]]
    assert {g["timeValid"] for g in games} == {False}
    assert store.week_fields(games) == ("2027-01-10T05:00:00Z", "401873181")


def test_line_is_kept_once_the_game_starts(tick, store, monkeypatch):
    serve(monkeypatch, tick, [board(10), board(11)])
    tick.handler({"force": True}, None)

    live = copy.deepcopy(board(10))
    for e in live["events"]:
        e["competitions"][0]["status"]["type"] = {"name": "STATUS_IN_PROGRESS", "state": "in", "completed": False}
        for t in e["competitions"][0]["competitors"]:
            t["score"] = "7"
        e["competitions"][0]["odds"][0]["spread"] = -9.5
    serve(monkeypatch, tick, [live, board(11)])
    tick.handler({"force": True}, None)

    tnf = next(g for g in store.list_games(2026, 10) if g["gameId"] == "401873052")
    assert tnf["status"] == "STATUS_IN_PROGRESS"
    assert tnf["lines"]["spread"] == -2.5


def test_noop_tick_touches_nothing(tick, store, monkeypatch):
    calls = serve(monkeypatch, tick, [board(10)])
    assert tick.handler({}, None) == {"mode": None}
    assert calls == []
    assert poll_rows() == []


def test_espn_failure_records_run_then_raises(tick, monkeypatch):
    serve(monkeypatch, tick, [board(10)], status=403)
    with pytest.raises(RuntimeError, match="403"):
        tick.handler({"force": True}, None)
    [row] = poll_rows()
    assert "403" in row["error"]
