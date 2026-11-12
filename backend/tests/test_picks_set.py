import pytest

from lambdas.common import groups
from tests.conftest import DOM, PAT, SAM, call, seed_week, table

LOCK = "2027-09-10T00:20:00Z"
GAMES = [("101", "BAL", "KC", 40), ("102", "PIT", "CIN", 60), ("103", "DAL", "PHI", 50)]
FULL = {"101": {"team": "KC", "conf": 3}, "102": {"team": "PIT", "conf": 1}, "103": {"team": "PHI", "conf": 2}}


@pytest.fixture
def api(app):
    seed_week(2027, 1, LOCK, GAMES)
    names = ("groups_create", "invites_create", "invites_accept", "gow_set", "picks_set")
    return {name: app(name) for name in names}


@pytest.fixture
def gid(api):
    gid = call(api["groups_create"], DOM, {"name": "Pool", "season": 2027})[1]["groupId"]
    code = call(api["invites_create"], DOM, {"groupId": gid})[1]["code"]
    call(api["invites_accept"], PAT, {"code": code, "entryType": "season"})
    call(api["gow_set"], DOM, {"groupId": gid, "week": 1, "gameId": "102"})
    return gid


def save(api, gid, picks, tiebreak=45, who=PAT, week=1):
    return call(api["picks_set"], who, {"groupId": gid, "week": week, "picks": picks, "tiebreak": tiebreak})


def stored(gid, sub="u-pat"):
    return table().get_item(Key={"PK": f"GROUP#{gid}#S2027#W01", "SK": f"PICK#{sub}"}).get("Item")


def test_full_picks_are_complete_and_one_item_per_member_week(api, gid):
    status, data = save(api, gid, FULL)
    assert status == 200
    assert data["pick"]["complete"] is True
    assert data["pick"]["tiebreak"] == 45

    save(api, gid, {**FULL, "102": {"team": "CIN", "conf": 1}}, tiebreak=51)
    item = stored(gid)
    assert item["picks"]["102"] == {"team": "CIN", "conf": 1}
    assert item["tiebreak"] == 51
    assert [i["SK"] for i in table().scan()["Items"] if i["SK"].startswith("PICK#")] == ["PICK#u-pat"]


@pytest.mark.parametrize(
    "picks, tiebreak",
    [
        ({"101": {"team": "KC", "conf": 3}}, 45),  # games left unpicked
        ({**FULL, "103": {"team": None, "conf": 2}}, 45),  # a ranked game with no team
        (FULL, None),  # no tiebreak
    ],
)
def test_drafts_save_but_are_not_complete(api, gid, picks, tiebreak):
    status, data = save(api, gid, picks, tiebreak)
    assert status == 200
    assert data["pick"]["complete"] is False


@pytest.mark.parametrize(
    "picks, message",
    [
        ({**FULL, "103": {"team": "PHI", "conf": 3}}, "Each confidence value can be used once"),
        ({**FULL, "103": {"team": "PHI", "conf": 4}}, "Confidence must be 1 to 3"),
        ({**FULL, "103": {"team": "NYG", "conf": 2}}, "NYG isn't playing in game 103"),
        ({**FULL, "999": {"team": "NYG", "conf": 2}}, "Game 999 isn't open for picks this week"),
    ],
)
def test_rejects_invalid_picks(api, gid, picks, message):
    assert save(api, gid, picks) == (400, message)
    assert stored(gid) is None


@pytest.mark.parametrize("tiebreak", [45.5, "45", -1])
def test_tiebreak_must_be_a_whole_number(api, gid, tiebreak):
    assert save(api, gid, FULL, tiebreak)[0] == 400


def test_waits_for_the_gow(api):
    gid = call(api["groups_create"], DOM, {"name": "No GOW", "season": 2027})[1]["groupId"]
    assert save(api, gid, FULL, who=DOM) == (409, "Picks open once the game of the week is set")


def test_rejects_once_the_group_clock_reaches_lock(api, gid):
    save(api, gid, FULL)
    table().update_item(
        Key={"PK": f"GROUP#{gid}", "SK": "META"}, UpdateExpression="SET clock = :c", ExpressionAttributeValues={":c": LOCK}
    )
    status, message = save(api, gid, {**FULL, "102": {"team": "CIN", "conf": 1}})
    assert (status, message) == (409, "Week 1 locked at kickoff of its first game")
    assert stored(gid)["picks"]["102"]["team"] == "PIT"


def test_lock_is_reread_from_the_week_on_every_write(api, gid):
    from lambdas.common import nfl_store

    assert save(api, gid, FULL)[0] == 200
    # A flex moves the first kickoff earlier, to a time already past.
    nfl_store.table().update_item(
        Key={"PK": "SEASON#2027#W01", "SK": "WEEK"},
        UpdateExpression="SET lockAt = :l",
        ExpressionAttributeValues={":l": "2026-01-01T00:00:00Z"},
    )
    assert save(api, gid, FULL)[0] == 409


def test_members_only_and_not_before_joining(api, gid, monkeypatch):
    assert save(api, gid, FULL, who=SAM)[0] == 404
    monkeypatch.setattr(groups, "last_locked_week", lambda season: 3)
    code = call(api["invites_create"], DOM, {"groupId": gid})[1]["code"]
    call(api["invites_accept"], SAM, {"code": code, "entryType": "weekly"})
    assert save(api, gid, FULL, who=SAM) == (409, "You joined in Week 4")
