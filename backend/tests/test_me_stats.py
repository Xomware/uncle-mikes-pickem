"""GET /me/stats after a graded week: the caller's own fold, season place and money."""

import boto3
import pytest

from lambdas.common import nfl_store
from tests.conftest import DOM, PAT, SAM, call, create_table, seed_week, table
from tests.test_results_api import DOM_PICKS, FINALS, GAMES, LOCK, PAT_PICKS

NAMES = (
    "groups_create", "invites_create", "invites_accept", "rules_update", "gow_set", "picks_set", "results_regrade", "me_stats",
)


@pytest.fixture
def api(app, monkeypatch):
    from lambdas.common import events

    monkeypatch.setenv("OPS_TABLE", "ops")
    create_table("ops")
    monkeypatch.setattr(events, "dynamodb", boto3.resource("dynamodb"))
    seed_week(2027, 1, LOCK, GAMES)
    return {name: app(name) for name in NAMES}


@pytest.fixture
def gid(api):
    gid = call(api["groups_create"], DOM, {"name": "Pool", "season": 2027})[1]["groupId"]
    code = call(api["invites_create"], DOM, {"groupId": gid})[1]["code"]
    call(api["invites_accept"], PAT, {"code": code, "entryType": "season"})
    call(api["rules_update"], DOM, {"groupId": gid, "changes": {"fees": {"weekly": 5, "yearly": 0, "death": 0}}})
    call(api["gow_set"], DOM, {"groupId": gid, "week": 1, "gameId": "102"})
    call(api["picks_set"], DOM, {"groupId": gid, "week": 1, "picks": DOM_PICKS, "tiebreak": 45})
    call(api["picks_set"], PAT, {"groupId": gid, "week": 1, "picks": PAT_PICKS, "tiebreak": 38})
    table().update_item(
        Key={"PK": f"GROUP#{gid}", "SK": "META"},
        UpdateExpression="SET clock = :c",
        ExpressionAttributeValues={":c": "2027-09-15T12:00:00Z"},
    )
    for game_id, (away, home) in FINALS.items():
        nfl_store.save_game(2027, 1, {
            "gameId": game_id, "completed": True, "awayScore": away, "homeScore": home,
            "confirmedBy": ["espn", "nflverse"],
        })
    call(api["results_regrade"], DOM, {"groupId": gid})
    return gid


def stats(api, gid, who):
    return call(api["me_stats"], who, query={"id": gid})


def test_dom_after_week_one(api, gid):
    status, data = stats(api, gid, DOM)
    assert status == 200
    assert (data["throughWeek"], data["entryType"]) == (1, "season")
    # KC 3 right, CIN 2 wrong on the GOW, PHI 1 right; kickoffs run 101, 102, 103.
    assert data["record"] == {"right": 2, "wrong": 1, "tie": 0}
    assert data["points"] == {"earned": 4, "possible": 6}
    assert data["streak"] == {"longest": 1, "current": 1}
    assert data["gow"] == {"right": 0, "wrong": 1, "tie": 0}
    assert data["weeks"] == [
        {"week": 1, "status": "final", "weekly": 4, "place": "2", "field": 2, "missed": False, "won": False}
    ]
    assert data["season"] == {"place": "2", "total": 2, "gow": -2}
    assert data["money"] == {"won": 0, "pending": 0}
    assert data["teams"] == [
        {"team": "CIN", "right": 0, "wrong": 1, "tie": 0, "won": 0, "lost": 2},
        {"team": "KC", "right": 1, "wrong": 0, "tie": 0, "won": 3, "lost": 0},
        {"team": "PHI", "right": 1, "wrong": 0, "tie": 0, "won": 1, "lost": 0},
    ]
    assert [(c["conf"], c["right"], c["wrong"]) for c in data["confidence"]] == [(1, 1, 0), (2, 0, 1), (3, 1, 0)]


def test_pat_won_the_week(api, gid):
    data = stats(api, gid, PAT)[1]
    assert data["weeks"][0]["won"] is True
    assert data["streak"] == {"longest": 2, "current": 2}
    # $5 weekly, two members: Pat takes the $10 pot.
    assert data["money"] == {"won": 1000, "pending": 0}


def test_non_member_is_404(api, gid):
    assert stats(api, gid, SAM)[0] == 404
