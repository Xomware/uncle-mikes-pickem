from datetime import datetime, timezone

import pytest

from lambdas.common import clock, picks
from tests.conftest import DOM, PAT, call, seed_week, table

LOCK = "2027-09-10T00:20:00Z"
# 104 is last by kickoff, so it's the tiebreak game.
GAMES = [("101", "BAL", "KC", 40), ("102", "PIT", "CIN", 60), ("103", "DAL", "PHI", 70), ("104", "SF", "LAR", 10)]
FULL = {
    "101": {"team": "KC", "conf": 4},
    "102": {"team": "PIT", "conf": 2},
    "103": {"team": "PHI", "conf": 3},
    "104": {"team": "SF", "conf": 1},
}


@pytest.fixture
def api(app):
    seed_week(2027, 1, LOCK, GAMES)
    names = ("groups_create", "invites_create", "invites_accept", "gow_set", "picks_set", "picks_get", "games_cancel")
    return {name: app(name) for name in names}


@pytest.fixture
def gid(api):
    gid = call(api["groups_create"], DOM, {"name": "Pool", "season": 2027})[1]["groupId"]
    code = call(api["invites_create"], DOM, {"groupId": gid})[1]["code"]
    call(api["invites_accept"], PAT, {"code": code, "entryType": "season"})
    call(api["gow_set"], DOM, {"groupId": gid, "week": 1, "gameId": "102"})
    call(api["picks_set"], PAT, {"groupId": gid, "week": 1, "picks": FULL, "tiebreak": 44})
    return gid


def cancel(api, gid, game, canceled=True, who=DOM):
    return call(api["games_cancel"], who, {"groupId": gid, "week": 1, "gameId": game, "canceled": canceled})


def pat_pick(gid):
    return table().get_item(Key={"PK": f"GROUP#{gid}#S2027#W01", "SK": "PICK#u-pat"})["Item"]


def test_rerank_keeps_order_and_closes_the_gap():
    games = [{"gameId": g} for g in ("101", "102", "104")]
    assert picks.rerank(FULL, games) == {
        "101": {"team": "KC", "conf": 3},
        "102": {"team": "PIT", "conf": 2},
        "104": {"team": "SF", "conf": 1},
    }


def test_cancel_drops_n_and_reranks_saved_picks(api, gid):
    status, data = cancel(api, gid, "103")
    assert (status, data) == (200, {"canceled": ["103"], "games": 3, "picksUpdated": 1})
    item = pat_pick(gid)
    assert {k: v["conf"] for k, v in item["picks"].items()} == {"101": 3, "102": 2, "104": 1}
    assert item["complete"] is True

    week = call(api["picks_get"], PAT, query={"groupId": gid})[1]
    assert [g["gameId"] for g in week["games"] if g["canceled"]] == ["103"]
    # N is now 3: conf 4 is out of range, and the canceled game can't be picked.
    three = {k: v for k, v in FULL.items() if k != "103"}
    assert call(api["picks_set"], PAT, {"groupId": gid, "week": 1, "picks": three, "tiebreak": 44})[0] == 400
    with_103 = {**FULL, "101": {"team": "KC", "conf": 3}}
    assert call(api["picks_set"], PAT, {"groupId": gid, "week": 1, "picks": with_103, "tiebreak": 44})[0] == 400


def test_restoring_a_game_leaves_picks_incomplete(api, gid):
    cancel(api, gid, "103")
    status, data = cancel(api, gid, "103", canceled=False)
    assert data["canceled"] == []
    item = pat_pick(gid)
    assert "103" not in item["picks"]
    assert item["complete"] is False


def test_guards(api, gid):
    assert cancel(api, gid, "101", who=PAT)[0] == 403
    assert cancel(api, gid, "102") == (409, "Choose another game of the week first")
    assert cancel(api, gid, "104") == (409, "That's the tiebreak game, so it can't be canceled")
    assert cancel(api, gid, "999")[0] == 400
    cancel(api, gid, "101")
    assert call(api["gow_set"], DOM, {"groupId": gid, "week": 1, "gameId": "101"}) == (
        409,
        "That game is canceled for this group",
    )


def test_cron_skips_a_canceled_game_when_picking_the_gow(app, monkeypatch):
    seed_week(2027, 1, LOCK, GAMES)
    create = app("groups_create")
    tick = app("cron_tick")
    gid = call(create, DOM, {"name": "Pool", "season": 2027})[1]["groupId"]
    table().put_item(Item={"PK": f"GROUP#{gid}#S2027#W01", "SK": "CANCELED", "gameIds": ["103"]})
    fixed = datetime(2027, 9, 8, tzinfo=timezone.utc)
    monkeypatch.setattr(clock, "datetime", type("dt", (datetime,), {"now": staticmethod(lambda tz=None: fixed)}))
    tick.auto_gow()
    gow = table().get_item(Key={"PK": f"GROUP#{gid}#S2027#W01", "SK": "GOW"})["Item"]
    assert gow["gameId"] == "102"
