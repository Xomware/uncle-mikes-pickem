import pytest

from lambdas.common import nfl_store
from tests.conftest import DOM, PAT, SAM, call, table

OPEN = "2099-09-10T00:20:00Z"
LOCKED = "2000-09-10T00:20:00Z"
GAMES = {1: [("KC", "BAL"), ("GB", "PHI")], 2: [("KC", "CIN"), ("DAL", "NYG")]}


def schedule(season=2027, locks=None):
    locks = locks or {}
    for week, games in GAMES.items():
        ids = []
        for n, (away, home) in enumerate(games):
            gid = f"{week}0{n}"
            ids.append(gid)
            nfl_store.save_game(
                season,
                week,
                {"gameId": gid, "kickoff": OPEN, "away": {"abbr": away}, "home": {"abbr": home}, "lines": {"spread": -3.5}},
            )
        nfl_store.save_week(season, week, locks.get(week, OPEN), ids[-1], ids, "2000-01-01T00:00:00Z")


@pytest.fixture
def api(app):
    names = ("groups_create", "invites_create", "invites_accept", "rules_update", "death_entry", "death_pick", "death_board")
    return {name: app(name) for name in names}


@pytest.fixture
def gid(api):
    gid = call(api["groups_create"], DOM, {"name": "Pool", "season": 2027})[1]["groupId"]
    code = call(api["invites_create"], DOM, {"groupId": gid})[1]["code"]
    call(api["invites_accept"], PAT, {"code": code})
    return gid


def entry(api, gid, who=PAT, **body):
    return call(api["death_entry"], who, {"groupId": gid, **body})


def pick(api, gid, entry_id, week, team, who=PAT):
    return call(api["death_pick"], who, {"groupId": gid, "entryId": entry_id, "week": week, "team": team})


def set_clock(gid, at):
    table().update_item(
        Key={"PK": f"GROUP#{gid}", "SK": "META"}, UpdateExpression="SET clock = :c", ExpressionAttributeValues={":c": at}
    )


def test_entries_are_numbered_per_member_by_default(api, gid):
    schedule()
    assert entry(api, gid)[1]["label"] == "Pat 1"
    assert entry(api, gid)[1]["label"] == "Pat 2"
    status, data = entry(api, gid, label="  Pat's backup ")
    assert status == 201
    assert data["label"] == "Pat's backup"
    assert entry(api, gid, who=DOM)[1]["label"] == "Dom 1"


def test_organizer_adds_an_entry_for_a_member(api, gid):
    status, data = entry(api, gid, who=DOM, sub=PAT["sub"])
    assert (status, data["ownerSub"], data["label"]) == (201, "u-pat", "Pat 1")
    assert entry(api, gid, who=PAT, sub=DOM["sub"])[0] == 403
    assert entry(api, gid, who=DOM, sub="u-nobody")[0] == 404
    assert entry(api, gid, who=SAM)[0] == 404


def test_entries_close_at_the_week_one_lock(api, gid):
    schedule(locks={1: LOCKED})
    status, message = entry(api, gid)
    assert status == 409
    assert "Week 1" in message


def test_pick_then_change_before_lock(api, gid):
    schedule()
    eid = entry(api, gid)[1]["entryId"]
    assert pick(api, gid, eid, 1, "kc") == (200, {"entryId": eid, "label": "Pat 1", "picks": {"1": "KC"}})
    assert pick(api, gid, eid, 1, "PHI")[1]["picks"] == {"1": "PHI"}


def test_team_used_once_per_season(api, gid):
    schedule()
    eid = entry(api, gid)[1]["entryId"]
    pick(api, gid, eid, 1, "KC")
    status, message = pick(api, gid, eid, 2, "KC")
    assert status == 409
    assert "already used" in message
    # Another entry of the same member has its own used teams.
    other = entry(api, gid)[1]["entryId"]
    assert pick(api, gid, other, 2, "KC")[0] == 200


def test_rejects_at_or_after_lock_on_the_group_clock(api, gid):
    schedule()
    eid = entry(api, gid)[1]["entryId"]
    set_clock(gid, OPEN)
    status, message = pick(api, gid, eid, 1, "KC")
    assert (status, message) == (409, "Week 1 is locked")


def test_rejects_eliminated_entries(api, gid):
    schedule()
    eid = entry(api, gid)[1]["entryId"]
    table().update_item(
        Key={"PK": f"GROUP#{gid}#S2027", "SK": f"DEATH#{eid}"},
        UpdateExpression="SET eliminatedWeek = :w",
        ExpressionAttributeValues={":w": 1},
    )
    status, message = pick(api, gid, eid, 2, "DAL")
    assert status == 409
    assert "eliminated in Week 1" in message


def test_rejects_teams_not_playing_unscheduled_weeks_and_other_peoples_entries(api, gid):
    schedule()
    eid = entry(api, gid)[1]["entryId"]
    assert pick(api, gid, eid, 1, "DAL")[0] == 400
    assert pick(api, gid, eid, 3, "DAL")[0] == 404
    assert pick(api, gid, eid, 19, "DAL")[0] == 400
    assert pick(api, gid, eid, 1, "KC", who=DOM)[0] == 404
    assert pick(api, gid, eid, 1, "KC", who=SAM)[0] == 404


def board(api, gid, who=PAT):
    return call(api["death_board"], who, query={"id": gid})


def test_board_hides_other_entries_picks_until_lock(api, gid):
    schedule()
    mine = entry(api, gid)[1]["entryId"]
    dom = entry(api, gid, who=DOM)[1]["entryId"]
    pick(api, gid, mine, 1, "KC")
    pick(api, gid, dom, 1, "GB", who=DOM)

    status, data = board(api, gid)
    assert status == 200
    rows = {r["entryId"]: r for r in data["entries"]}
    assert rows[mine]["picks"] == {"1": "KC"}
    assert rows[mine]["used"] == ["KC"]
    assert rows[mine]["mine"] is True
    assert rows[dom]["picks"] == {"1": None}
    assert rows[dom]["used"] == []
    assert rows[dom]["ownerName"] == "Dom"

    set_clock(gid, OPEN)
    rows = {r["entryId"]: r for r in board(api, gid)[1]["entries"]}
    assert rows[dom]["picks"] == {"1": "GB"}
    assert rows[dom]["used"] == ["GB"]


def test_board_returns_the_open_weeks_games(api, gid):
    schedule()
    week = board(api, gid)[1]["week"]
    assert (week["number"], week["lockAt"], week["locked"]) == (1, OPEN, False)
    assert week["games"][0] == {
        "gameId": "100", "kickoff": OPEN, "away": "KC", "home": "BAL", "spread": -3.5, "details": None,
    }


def test_board_without_a_schedule_has_no_week(api, gid):
    assert board(api, gid)[1]["week"] is None


def test_board_lives_status_and_order(api, gid):
    schedule()
    call(api["rules_update"], DOM, {"groupId": gid, "changes": {"deathSecondLife": True}})
    alive = entry(api, gid, label="b alive")[1]["entryId"]
    out = entry(api, gid, label="a out")[1]["entryId"]
    table().update_item(
        Key={"PK": f"GROUP#{gid}#S2027", "SK": f"DEATH#{out}"},
        UpdateExpression="SET eliminatedWeek = :w, livesLeft = :l",
        ExpressionAttributeValues={":w": 2, ":l": 0},
    )
    data = board(api, gid)[1]
    assert data["startLives"] == 2
    assert [(r["entryId"], r["status"], r["livesLeft"]) for r in data["entries"]] == [
        (alive, "alive", 2),
        (out, "eliminated", 0),
    ]


def test_board_is_members_only(api, gid):
    assert board(api, gid, who=SAM)[0] == 404
