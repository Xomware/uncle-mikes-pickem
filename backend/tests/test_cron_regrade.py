import boto3
import pytest

from tests.test_cron_tick import board, serve, tick  # noqa: F401  (tick is a fixture)
from tests.test_finals import TNF, final_board, nflverse_says

PK = "GROUP#g#S2026#W10"


@pytest.fixture
def group(tick, monkeypatch):
    """A live 2026 group whose clock is past the Week 10 lock, with one member's full Week 10 sheet: every home team."""
    from lambdas.common import events

    monkeypatch.setattr(events, "dynamodb", boto3.resource("dynamodb"))
    app = boto3.resource("dynamodb").Table("app")
    app.put_item(Item={"PK": "GROUP#g", "SK": "META", "groupId": "g", "season": 2026, "clock": "2026-11-13T06:00:00Z"})
    app.put_item(Item={"PK": "GROUP#g", "SK": "MEMBER#a", "sub": "a", "name": "A", "entryType": "season"})
    games = board(10)["events"]
    picks = {
        e["id"]: {"team": next(t["team"]["abbreviation"] for t in e["competitions"][0]["competitors"] if t["homeAway"] == "home"), "conf": i}
        for i, e in enumerate(games, 1)
    }
    app.put_item(Item={"PK": PK, "SK": "PICK#a", "sub": "a", "picks": picks, "tiebreak": 40, "complete": True})
    return app


def result(app):
    return app.get_item(Key={"PK": PK, "SK": "RESULT"})["Item"]


def test_a_new_final_regrades_the_week(tick, store, group, monkeypatch):
    serve(monkeypatch, tick, [final_board(), board(11)])
    nflverse_says(monkeypatch, tick, 17, 20)
    out = tick.handler({"force": True}, None)
    assert out["finalsChanged"] == [10]
    # The sweep grades Week 10 only: the store has no Weeks 1-9 for this live season.
    assert out["regraded"] == {"g": [10]}
    graded = result(group)
    assert graded["status"] == "open"
    assert graded["members"]["a"]["games"][TNF] == "right"

    assert tick.handler({"force": True}, None)["regraded"] == {}


def test_live_tick_regrades_only_changed_weeks(tick, store, group, monkeypatch):
    serve(monkeypatch, tick, [board(10), board(11)])
    tick.handler({"force": True}, None)
    assert result(group)["members"]["a"]["games"][TNF] == "pending"

    assert tick.regrade_groups(2026, [], sweep=False) == {}
    serve(monkeypatch, tick, [final_board(), board(11)])
    nflverse_says(monkeypatch, tick, 17, 20)
    changed = tick.refresh(tick.datetime.now(), "live")["finalsChanged"]
    assert changed == [10]
    assert tick.regrade_groups(2026, changed, sweep=False) == {"g": [10]}
    assert result(group)["members"]["a"]["games"][TNF] == "right"
