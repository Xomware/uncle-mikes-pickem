"""End to end: a group picks, games go final, the organizer regrades, and the results and
standings endpoints serve RESULT and STANDINGS. Then an override and a post-lock cancel."""

import boto3
import pytest
from boto3.dynamodb.conditions import Key

from lambdas.common import nfl_store
from tests.conftest import DOM, PAT, SAM, call, create_table, seed_week, table

LOCK = "2027-09-10T00:20:00Z"
# 103 kicks off last, so it's the tiebreak game.
GAMES = [("101", "BAL", "KC", 40), ("102", "PIT", "CIN", 60), ("103", "DAL", "PHI", 70)]
FINALS = {"101": (20, 27), "102": (24, 17), "103": (10, 30)}  # KC, PIT, PHI win; MNF total 40
# Dom: KC 3 right, CIN 2 wrong on the GOW, PHI 1 right -> weekly 4, yearly 4 - 2 = 2.
DOM_PICKS = {"101": {"team": "KC", "conf": 3}, "102": {"team": "CIN", "conf": 2}, "103": {"team": "PHI", "conf": 1}}
# Pat: BAL 1 wrong, PIT 3 right on the GOW, PHI 2 right -> weekly 5, yearly 5 + 3 = 8.
PAT_PICKS = {"101": {"team": "BAL", "conf": 1}, "102": {"team": "PIT", "conf": 3}, "103": {"team": "PHI", "conf": 2}}

NAMES = (
    "groups_create", "invites_create", "invites_accept", "gow_set", "picks_set", "games_cancel",
    "results_override", "results_regrade", "results_week", "standings_season",
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
    # Sam plays for the weekly pot only, and misses Week 1.
    call(api["invites_accept"], SAM, {"code": code, "entryType": "weekly"})
    call(api["gow_set"], DOM, {"groupId": gid, "week": 1, "gameId": "102"})
    assert call(api["picks_set"], DOM, {"groupId": gid, "week": 1, "picks": DOM_PICKS, "tiebreak": 45})[0] == 200
    assert call(api["picks_set"], PAT, {"groupId": gid, "week": 1, "picks": PAT_PICKS, "tiebreak": 38})[0] == 200
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
    return gid


def week(api, gid, who=DOM):
    return call(api["results_week"], who, query={"groupId": gid, "week": "1"})


def season(api, gid, who=PAT):
    return call(api["standings_season"], who, query={"id": gid})


def scores(data):
    return [(m["name"], m["weekly"], m["yearly"], m["place"], m["missed"]) for m in data["members"]]


def events():
    ops = boto3.resource("dynamodb").Table("ops")
    return [e["eventId"] for e in ops.query(KeyConditionExpression=Key("PK").eq("EVENTS"))["Items"]]


def test_pick_final_regrade_read(api, gid):
    assert week(api, gid)[0] == 404
    assert season(api, gid)[1]["rows"] == []
    assert call(api["results_regrade"], PAT, {"groupId": gid})[0] == 403

    status, out = call(api["results_regrade"], DOM, {"groupId": gid})
    assert status == 200 and out["weeks"] == [1] and out["standings"] is True

    status, data = week(api, gid, who=SAM)
    assert status == 200
    assert (data["status"], data["winners"], data["tiebreakTotal"], data["gowGameId"]) == ("final", ["u-pat"], 40, "102")
    # Sam's weekly is the lowest submitter minus 1; the yearly missed score is set by season members (2 - 1).
    assert scores(data) == [("Pat", 5, 8, "1", False), ("Dom", 4, 2, "2", False), ("Sam", 3, 1, "3", True)]
    assert data["members"][1]["games"] == {"101": "right", "102": "wrong", "103": "right"}
    assert data["games"]["102"] == {"awayScore": 24, "homeScore": 17, "result": "PIT", "confirmed": True}

    status, standing = season(api, gid)
    assert (standing["throughWeek"], standing["final"]) == (1, True)
    assert [(r["name"], r["total"], r["gow"], r["place"]) for r in standing["rows"]] == [("Pat", 8, 3, "1"), ("Dom", 2, -2, "2")]

    assert call(api["results_regrade"], DOM, {"groupId": gid, "week": 1})[1]["weeks"] == []
    assert events() == ["result#W01"]


def test_override_and_cancel_after_lock_regrade(api, gid):
    call(api["results_regrade"], DOM, {"groupId": gid})
    override = {"groupId": gid, "week": 1, "gameId": "102", "awayScore": 17, "homeScore": 24}
    assert call(api["results_override"], PAT, override)[0] == 403
    status, out = call(api["results_override"], DOM, override)
    assert status == 200 and out["weeks"] == [1]
    # CIN wins now: Dom's GOW pick is right (weekly 6, yearly 8), Pat's wrong (2, -1).
    data = week(api, gid)[1]
    assert scores(data)[:2] == [("Dom", 6, 8, "1", False), ("Pat", 2, -1, "2", False)]
    assert data["winners"] == ["u-dom"]
    assert [r["name"] for r in season(api, gid)[1]["rows"]] == ["Dom", "Pat"]
    assert events() == ["result#W01", "result#W01#v2"]

    status, out = call(api["games_cancel"], DOM, {"groupId": gid, "week": 1, "gameId": "101", "canceled": True})
    assert (status, out["regraded"]) == (200, [1])
    data = week(api, gid)[1]
    dom = data["members"][0]
    # Dom's 3 on the canceled game voids to 0 and nothing is re-ranked.
    assert (dom["weekly"], dom["games"]["101"]) == (3, "void")
    pick = table().get_item(Key={"PK": f"GROUP#{gid}#S2027#W01", "SK": "PICK#u-dom"})["Item"]
    assert pick["picks"]["101"]["conf"] == 3
    assert data["canceled"] == ["101"]

    clear = {**override, "awayScore": None, "homeScore": None}
    call(api["results_override"], DOM, clear)
    assert week(api, gid)[1]["games"]["102"]["result"] == "PIT"


def test_override_guards(api, gid):
    body = {"groupId": gid, "week": 1, "gameId": "999", "awayScore": 1, "homeScore": 2}
    assert call(api["results_override"], DOM, body)[0] == 400
    assert call(api["results_override"], DOM, {**body, "gameId": "101", "homeScore": None})[0] == 400
