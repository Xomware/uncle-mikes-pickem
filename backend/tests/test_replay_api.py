import pytest

from lambdas.common import nfl_store
from tests.conftest import DOM, PAT, call, table

W1_LOCK = "2026-09-11T00:20:00Z"
W2_LOCK = "2026-09-18T00:15:00Z"


def game(gid, kickoff, away, home):
    return {"gameId": gid, "kickoff": kickoff, "lines": {"spread": -3}, "away": {"abbr": away}, "home": {"abbr": home},
            "awayScore": 20, "homeScore": 17, "winner": away, "tie": False, "final": True}


@pytest.fixture
def api(app):
    names = ("groups_create", "groups_get", "invites_create", "invites_accept", "replay_advance",
             "death_entry", "death_pick", "death_board")
    return {name: app(name) for name in names}


@pytest.fixture
def loaded(api):
    nfl_store.save_replay(2026, {
        1: [game("1", W1_LOCK, "DAL", "PHI")],
        2: [game("2", W2_LOCK, "BUF", "MIA")],
    }, "2026-11-12T00:00:00Z")


@pytest.fixture
def gid(api, loaded):
    status, group = call(api["groups_create"], DOM, {"name": "Replay", "season": 2026, "replay": True})
    assert status == 201
    code = call(api["invites_create"], DOM, {"groupId": group["groupId"]})[1]["code"]
    call(api["invites_accept"], PAT, {"code": code})
    return group["groupId"]


def advance(api, gid, to, who=DOM):
    return call(api["replay_advance"], who, {"groupId": gid, "to": to})


def test_replay_needs_2026_and_loaded_rows(api):
    assert call(api["groups_create"], DOM, {"name": "R", "season": 2027, "replay": True})[0] == 400
    assert call(api["groups_create"], DOM, {"name": "R", "season": 2026, "replay": True})[0] == 409


def test_clock_starts_an_hour_before_week_1_lock(api, gid):
    meta = table().get_item(Key={"PK": f"GROUP#{gid}", "SK": "META"})["Item"]
    assert meta["replay"] is True and meta["clock"] == "2026-09-10T23:20:00Z"
    _, data = call(api["groups_get"], DOM, query={"id": gid})
    assert data["replay"] == {"clock": "2026-09-10T23:20:00Z", "lockAts": {"1": W1_LOCK, "2": W2_LOCK}}
    assert all(m["joinedWeek"] == 1 for m in data["members"])


def test_advance_is_organizer_only_and_replay_only(api, gid, loaded):
    assert advance(api, gid, "2026-09-12T00:00:00Z", who=PAT)[0] == 403
    live = call(api["groups_create"], DOM, {"name": "Live", "season": 2026})[1]["groupId"]
    assert advance(api, live, "2026-09-12T00:00:00Z")[0] == 409
    assert advance(api, gid, "2026-09-12")[0] == 400  # no timezone

    assert advance(api, gid, "2026-09-11T20:00:00-04:00") == (200, {"groupId": gid, "clock": "2026-09-12T00:00:00Z"})
    _, data = call(api["groups_get"], DOM, query={"id": gid})
    assert data["replay"]["clock"] == "2026-09-12T00:00:00Z"


def test_death_pool_runs_on_replay_rows_and_virtual_clock(api, gid):
    # Live 2026 is at Week 10 with no Week 1 rows; the replay group still plays Week 1.
    nfl_store.set_current(2026, 10)
    entry_id = call(api["death_entry"], PAT, {"groupId": gid})[1]["entryId"]
    pick = {"groupId": gid, "entryId": entry_id, "week": 1, "team": "DAL"}
    assert call(api["death_pick"], PAT, pick)[0] == 200

    _, board = call(api["death_board"], PAT, query={"id": gid})
    assert board["week"]["number"] == 1 and not board["week"]["locked"]
    assert [(g["away"], g["home"]) for g in board["week"]["games"]] == [("DAL", "PHI")]

    advance(api, gid, "2026-09-12T00:00:00Z")
    assert call(api["death_pick"], PAT, pick) == (409, "Week 1 is locked")
    assert call(api["death_entry"], PAT, {"groupId": gid}) == (409, "Death pool entries closed at the Week 1 lock")
    _, board = call(api["death_board"], PAT, query={"id": gid})
    assert board["week"]["number"] == 2
    assert call(api["death_pick"], PAT, {**pick, "week": 2, "team": "BUF"})[0] == 200
