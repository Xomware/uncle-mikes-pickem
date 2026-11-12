import pytest

from lambdas.common import nfl_store
from tests.conftest import DOM, PAT, SAM, call, seed_week, table

LOCK = "2027-09-10T00:20:00Z"
GAMES = [("101", "BAL", "KC", 40), ("102", "PIT", "CIN", 60)]
PAT_PICKS = {"101": {"team": "KC", "conf": 2}, "102": {"team": "PIT", "conf": 1}}
DOM_PICKS = {"101": {"team": "BAL", "conf": 1}, "102": {"team": "CIN", "conf": 2}}


@pytest.fixture
def api(app):
    seed_week(2027, 1, LOCK, GAMES)
    names = ("groups_create", "invites_create", "invites_accept", "gow_set", "picks_set", "picks_get")
    return {name: app(name) for name in names}


@pytest.fixture
def gid(api):
    gid = call(api["groups_create"], DOM, {"name": "Pool", "season": 2027})[1]["groupId"]
    code = call(api["invites_create"], DOM, {"groupId": gid})[1]["code"]
    call(api["invites_accept"], PAT, {"code": code, "entryType": "season"})
    call(api["gow_set"], DOM, {"groupId": gid, "week": 1, "gameId": "102"})
    for who, picks in ((DOM, DOM_PICKS), (PAT, PAT_PICKS)):
        call(api["picks_set"], who, {"groupId": gid, "week": 1, "picks": picks, "tiebreak": 40})
    return gid


def read(api, gid, who=PAT, week=None):
    query = {"groupId": gid} | ({"week": week} if week else {})
    return call(api["picks_get"], who, query=query)


def lock(gid):
    table().update_item(
        Key={"PK": f"GROUP#{gid}", "SK": "META"}, UpdateExpression="SET clock = :c", ExpressionAttributeValues={":c": LOCK}
    )


def test_before_lock_you_see_only_your_own_picks(api, gid):
    status, data = read(api, gid)
    assert status == 200
    assert data["week"]["locked"] is False
    assert data["week"]["tiebreakGameId"] == "102"
    assert data["gow"]["gameId"] == "102"
    assert [g["gameId"] for g in data["games"]] == ["101", "102"]
    assert data["mine"]["picks"] == PAT_PICKS
    assert data["picks"] == []
    assert "BAL" not in str(data["mine"])


def test_after_lock_the_whole_group_is_visible(api, gid):
    lock(gid)
    status, data = read(api, gid)
    assert data["week"]["locked"] is True
    assert data["week"]["now"] == LOCK
    assert {p["sub"]: p["picks"] for p in data["picks"]} == {"u-dom": DOM_PICKS, "u-pat": PAT_PICKS}
    assert {m["name"] for m in data["members"]} == {"Dom", "Pat"}


def test_defaults_to_the_current_week_and_checks_params(api, gid):
    assert read(api, gid)[1]["week"]["week"] == 1
    assert read(api, gid, week="1")[1]["week"]["week"] == 1
    assert read(api, gid, week="19")[0] == 400
    assert read(api, gid, week="2") == (404, "Week 2 isn't on the schedule yet")
    assert read(api, gid, who=SAM) == (404, "Group not found")


def test_no_picks_yet(api, gid):
    status, data = read(api, gid, who=DOM)
    assert data["mine"]["picks"] == DOM_PICKS
    other = call(api["groups_create"], SAM, {"name": "Empty", "season": 2027})[1]["groupId"]
    status, data = read(api, other, who=SAM)
    assert (status, data["mine"], data["gow"]) == (200, None, None)


def test_a_replay_group_reads_replay_rows_on_its_clock(api):
    def game(gid, kickoff):
        return {"gameId": gid, "kickoff": kickoff, "away": {"abbr": "DAL"}, "home": {"abbr": "PHI"}, "lines": None,
                "winner": "PHI", "final": True}

    weeks = {1: [game("1", "2026-09-11T00:20:00Z")], 2: [game("2", "2026-09-18T00:15:00Z")]}
    nfl_store.save_replay(2026, weeks, "2026-11-12T00:00:00Z")
    gid = call(api["groups_create"], DOM, {"name": "Replay", "season": 2026, "replay": True})[1]["groupId"]

    data = read(api, gid, who=DOM)[1]
    assert (data["week"]["week"], data["week"]["locked"]) == (1, False)
    # The replay clock is before kickoff, so the result stays hidden.
    assert data["games"][0]["winner"] is None

    table().update_item(
        Key={"PK": f"GROUP#{gid}", "SK": "META"},
        UpdateExpression="SET clock = :c",
        ExpressionAttributeValues={":c": "2026-09-17T23:15:00Z"},
    )
    assert read(api, gid, who=DOM)[1]["week"]["week"] == 2
    week1 = read(api, gid, who=DOM, week="1")[1]
    assert week1["week"]["locked"] is True
    assert week1["games"][0]["winner"] == "PHI"
