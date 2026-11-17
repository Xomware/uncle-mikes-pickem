"""The regrade writes ANALYTICS beside RESULT, and GET /analytics/week serves it.

The group is test_results_api's: Dom and Pat have Week 1 sheets, Sam has none, 102 is the GOW.
"""

import pytest

from lambdas.common import analytics, nfl_store
from tests.conftest import DOM, PAT, SAM, call, table
from tests.test_results_api import FINALS, api, gid  # noqa: F401  (fixtures)

OUTSIDER = {"sub": "u-out", "email": "out@example.com", "name": "Out"}


@pytest.fixture
def odds_api(app):
    return app("analytics_week")


def get(odds_api, gid, who=DOM):
    return call(odds_api, who, query={"groupId": gid, "week": "1"})


def only_first_final():
    """Undo 102 and 103's finals: KC beat BAL, the rest is to play."""
    for game_id in ("102", "103"):
        nfl_store.save_game(2027, 1, {"gameId": game_id, "completed": False, "awayScore": None, "homeScore": None})


def by_name(data):
    return {m["name"]: m for m in data["members"]}


def test_odds_after_each_final(api, gid, odds_api):
    assert get(odds_api, gid)[0] == 404
    only_first_final()
    call(api["results_regrade"], DOM, {"groupId": gid})

    status, data = get(odds_api, gid, PAT)
    assert status == 200
    rows = by_name(data)
    # After KC's win Dom has 3 and Pat 0. Coin flips on 102 and 103: Dom wins three of the
    # four outcomes outright, and PIT+DAL leaves them tied at 3 with no O/U, so it splits.
    assert rows["Dom"]["pWin"] == pytest.approx(0.625, abs=0.02)
    assert rows["Pat"]["pWin"] == pytest.approx(0.375, abs=0.02)
    assert rows["Sam"] == {"sub": SAM["sub"], "name": "Sam", "pWin": 0, "root": {}}
    assert [m["name"] for m in data["members"]] == ["Dom", "Pat", "Sam"]
    assert data["games"] == {"102": {"pHome": 0.5, "source": "even"}, "103": {"pHome": 0.5, "source": "even"}}
    assert data["status"] == "open"

    root = rows["Pat"]["root"]["102"]
    assert root["away"] == pytest.approx(0.75, abs=0.03)  # PIT
    assert root["home"] == 0
    assert set(rows["Pat"]["root"]) == {"102", "103"}

    for game_id, (away, home) in FINALS.items():
        nfl_store.save_game(2027, 1, {"gameId": game_id, "completed": True, "awayScore": away, "homeScore": home})
    call(api["results_regrade"], DOM, {"groupId": gid})
    rows = by_name(get(odds_api, gid)[1])
    assert (rows["Dom"]["pWin"], rows["Pat"]["pWin"]) == (0, 1)
    assert rows["Pat"]["root"] == {}


def test_a_missing_item_is_written_on_an_unchanged_regrade(api, gid, odds_api):
    call(api["results_regrade"], DOM, {"groupId": gid})
    key = {"PK": f"GROUP#{gid}#S2027#W01", "SK": "ANALYTICS"}
    table().delete_item(Key=key)
    assert call(api["results_regrade"], DOM, {"groupId": gid})[1]["weeks"] == []
    assert table().get_item(Key=key)["Item"]["model"] == analytics.MODEL


def test_members_only(api, gid, odds_api, season_api):
    call(api["results_regrade"], DOM, {"groupId": gid})
    assert get(odds_api, gid, OUTSIDER) == (404, "Group not found")
    assert call(odds_api, DOM, query={"groupId": gid, "week": "19"})[0] == 400
    assert call(season_api, OUTSIDER, query={"id": gid}) == (404, "Group not found")


@pytest.fixture
def season_api(app):
    return app("analytics_season")


def season(season_api, gid):
    return call(season_api, PAT, query={"id": gid})[1]


def test_season_odds(api, gid, season_api):
    assert season(season_api, gid)["members"] == []
    only_first_final()
    call(api["results_regrade"], DOM, {"groupId": gid})
    data = season(season_api, gid)
    assert data["throughWeek"] == 1
    # Sam plays weekly only, so isn't on the yearly board.
    assert {m["name"] for m in data["members"]} == {"Dom", "Pat"}
    assert sum(m["pWin"] for m in data["members"]) == pytest.approx(1, abs=1e-3)

    # A regrade with nothing new leaves it; a deleted item is written back.
    key = {"PK": f"GROUP#{gid}#S2027", "SK": "ANALYTICS"}
    table().update_item(Key=key, UpdateExpression="SET probe = :p", ExpressionAttributeValues={":p": 1})
    call(api["results_regrade"], DOM, {"groupId": gid})
    assert table().get_item(Key=key)["Item"]["probe"] == 1
    table().delete_item(Key=key)
    call(api["results_regrade"], DOM, {"groupId": gid})
    assert season(season_api, gid)["throughWeek"] == 1
