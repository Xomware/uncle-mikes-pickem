from datetime import datetime, timezone

import pytest

from lambdas.common import clock, gow, nfl_store
from tests.conftest import DOM, PAT, SAM, call, seed_week, table

# Week 1 2027: TNF Thursday 2027-09-09 20:20 ET.
LOCK = "2027-09-10T00:20:00Z"
GAMES = [("101", "BAL", "KC", 40), ("102", "PIT", "CIN", 61.5), ("103", "DAL", "PHI", 61.5), ("104", "SF", "LAR", 30)]


def at(text):
    return datetime.fromisoformat(text).replace(tzinfo=timezone.utc)


@pytest.fixture
def api(app):
    seed_week(2027, 1, LOCK, GAMES)
    names = ("groups_create", "invites_create", "invites_accept", "members_update", "gow_set", "cron_tick")
    return {name: app(name) for name in names}


@pytest.fixture
def gid(api):
    gid = call(api["groups_create"], DOM, {"name": "Pool", "season": 2027})[1]["groupId"]
    code = call(api["invites_create"], DOM, {"groupId": gid})[1]["code"]
    call(api["invites_accept"], PAT, {"code": code, "entryType": "season"})
    return gid


def stored_gow(gid, week=1):
    return table().get_item(Key={"PK": f"GROUP#{gid}#S2027#W{week:02d}", "SK": "GOW"}).get("Item")


def set_gow(api, gid, game, who=DOM, week=1):
    return call(api["gow_set"], who, {"groupId": gid, "week": week, "gameId": game})


@pytest.mark.parametrize(
    "lock, due",
    [
        (LOCK, "2027-09-07T16:00:00+00:00"),  # EDT: Tuesday noon is 16:00Z
        ("2026-11-13T01:15:00Z", "2026-11-10T17:00:00+00:00"),  # EST: 17:00Z
        ("2026-11-15T18:00:00Z", "2026-11-10T17:00:00+00:00"),  # a week opening Sunday still uses that Tuesday
    ],
)
def test_deadline_is_tuesday_noon_eastern_before_the_lock(lock, due):
    assert gow.deadline(lock).astimezone(timezone.utc).isoformat() == due


def test_organizer_sets_and_changes_the_gow(api, gid):
    status, data = set_gow(api, gid, "103")
    assert status == 200
    assert data["gow"]["gameId"] == "103"
    assert data["gow"]["chosenBy"] == "u-dom"
    set_gow(api, gid, "101")
    assert stored_gow(gid)["gameId"] == "101"


def test_only_organizers_before_lock_and_only_games_of_the_week(api, gid):
    assert set_gow(api, gid, "101", who=PAT) == (403, "Only the group's owner or an admin can do that")
    assert set_gow(api, gid, "101", who=SAM)[0] == 404
    assert set_gow(api, gid, "999")[0] == 400
    assert set_gow(api, gid, "101", week=2)[0] == 404

    table().update_item(
        Key={"PK": f"GROUP#{gid}", "SK": "META"}, UpdateExpression="SET clock = :c", ExpressionAttributeValues={":c": LOCK}
    )
    status, message = set_gow(api, gid, "101")
    assert (status, message) == (409, "Week 1 locked at kickoff of its first game")
    assert stored_gow(gid) is None


def test_admin_can_set_it(api, gid):
    call(api["members_update"], DOM, {"groupId": gid, "sub": "u-pat", "role": "admin"})
    assert set_gow(api, gid, "104", who=PAT)[0] == 200


@pytest.fixture
def frozen(monkeypatch):
    """Set real time for clock.now(); a replay group's own clock still wins."""

    def freeze(text):
        fixed = at(text)
        monkeypatch.setattr(clock, "datetime", type("dt", (datetime,), {"now": staticmethod(lambda tz=None: fixed)}))

    return freeze


def test_cron_picks_top_hype_after_tuesday_noon_and_keeps_an_organizer_choice(api, gid, frozen):
    tick = api["cron_tick"]
    other = call(api["groups_create"], PAT, {"name": "Other", "season": 2027})[1]["groupId"]
    set_gow(api, other, "104", who=PAT)

    frozen("2027-09-07T15:58:00")
    assert tick.auto_gow() == []
    assert stored_gow(gid) is None

    frozen("2027-09-07T16:00:00")
    assert tick.auto_gow() == [f"{gid}#W01"]
    # 102 and 103 tie on hype; the earlier kickoff wins.
    assert {k: stored_gow(gid)[k] for k in ("gameId", "chosenBy")} == {"gameId": "102", "chosenBy": "auto"}
    assert stored_gow(other)["gameId"] == "104"
    frozen("2027-09-08T16:00:00")
    assert tick.auto_gow() == []


def test_cron_leaves_a_locked_week_alone(api, gid, frozen):
    frozen("2027-09-10T00:20:00")
    assert api["cron_tick"].auto_gow() == []
    assert stored_gow(gid) is None


def test_cron_judges_a_replay_group_on_its_virtual_clock(api, gid, frozen):
    kickoff = "2026-09-11T00:20:00Z"
    game = {"gameId": "9", "kickoff": kickoff, "away": {"abbr": "DAL"}, "home": {"abbr": "PHI"}, "lines": None}
    nfl_store.save_replay(2026, {1: [game]}, "2026-11-12T00:00:00Z")
    replay = call(api["groups_create"], DOM, {"name": "Replay", "season": 2026, "replay": True})[1]["groupId"]

    # Real time is before the 2027 deadline; the replay clock sits an hour before its Week 1 lock.
    frozen("2027-09-01T12:00:00")
    assert api["cron_tick"].auto_gow() == [f"{replay}#W01"]
    item = table().get_item(Key={"PK": f"GROUP#{replay}#S2026#W01", "SK": "GOW"})["Item"]
    assert (item["gameId"], item["chosenAt"]) == ("9", "2026-09-10T23:20:00Z")
