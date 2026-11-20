import urllib.error
from pathlib import Path

import pytest

from lambdas.common import nfl_store, nflverse
from lambdas.nfl_week.handler import fold_records
from tests.conftest import DOM, PAT, call, seed_week, table

CSV = (Path(__file__).parent / "fixtures" / "nflverse" / "games.csv").read_text()
LOCK = "2026-11-13T01:15:00Z"
GAMES = [("401873052", "WSH", "NYG", 40), ("401873060", "LAR", "ARI", 55)]


@pytest.fixture
def api(app, monkeypatch):
    seed_week(2026, 10, LOCK, GAMES)
    module = app("nfl_week")
    module.fetches = 0

    def fetch():
        module.fetches += 1
        return CSV

    monkeypatch.setattr(nflverse, "fetch", fetch)
    return module


def group(gid, name, replay=False, season=2026, picks=None):
    table().put_item(Item={"PK": f"GROUP#{gid}", "SK": "META", "groupId": gid, "name": name, "season": season, "replay": replay})
    table().put_item(Item={
        "PK": f"GROUP#{gid}", "SK": f"MEMBER#{DOM['sub']}", "GSI1PK": f"USER#{DOM['sub']}", "GSI1SK": f"GROUP#{gid}",
        "sub": DOM["sub"], "groupName": name, "season": season, "role": "owner",
    })
    if picks:
        table().put_item(Item={"PK": f"GROUP#{gid}#S{season}#W10", "SK": f"PICK#{DOM['sub']}", "sub": DOM["sub"], "picks": picks})


def test_current_week_with_hype_and_records_entering_it(api):
    status, data = call(api, DOM)
    assert status == 200
    assert (data["season"], data["week"], data["currentWeek"], data["weeks"]) == (2026, 10, 10, [10])
    first, second = data["games"]
    assert (first["gameId"], first["week"], first["hype"]) == ("401873052", 10, 40)
    # The fixture's Week 5: NYG and WAS tie, DEN beats LAC. nflverse's WAS is ESPN's WSH.
    assert (first["away"]["record"], first["home"]["record"]) == ("0-0-1", "0-0-1")
    assert second["away"]["record"] is None
    assert data["groups"] == []


def test_records_are_cached_once_every_earlier_game_is_final(api):
    call(api, DOM)
    call(api, DOM)
    assert api.fetches == 1
    item = nfl_store.table().get_item(Key={"PK": "SEASON#2026#W10", "SK": "RECORDS"})["Item"]
    assert item["complete"] is True and item["records"]["DEN"] == "1-0"


def test_a_week_after_unfinished_games_is_not_complete():
    records, complete = fold_records(CSV, 2026, 11)
    assert complete is False
    assert records == {"NYG": "0-0-1", "WSH": "0-0-1", "DEN": "1-0", "LAC": "0-1"}


def test_nflverse_down_still_returns_the_games(api, monkeypatch):
    def down():
        raise urllib.error.URLError("unreachable")

    monkeypatch.setattr(nflverse, "fetch", down)
    status, data = call(api, DOM)
    assert status == 200
    assert data["games"][0]["away"]["record"] is None
    assert nfl_store.table().get_item(Key={"PK": "SEASON#2026#W10", "SK": "RECORDS"}).get("Item") is None


def test_my_picks_in_each_group_of_the_season(api):
    group("g1", "Office", picks={"401873052": {"team": "NYG", "conf": 2}})
    group("g2", "Replay", replay=True)
    group("g3", "Next year", season=2027, picks={"1": {"team": "KC", "conf": 1}})
    # Another member's sheet never shows.
    table().put_item(Item={"PK": "GROUP#g1#S2026#W10", "SK": f"PICK#{PAT['sub']}", "sub": PAT["sub"], "picks": {}})

    groups = call(api, DOM)[1]["groups"]
    assert groups == [
        {"groupId": "g1", "name": "Office", "replay": False, "picks": {"401873052": {"team": "NYG", "conf": 2}}},
        {"groupId": "g2", "name": "Replay", "replay": True, "picks": None},
    ]


def test_week_param(api):
    assert call(api, DOM, query={"week": "10"})[1]["week"] == 10
    assert call(api, DOM, query={"week": "19"})[0] == 400
    assert call(api, DOM, query={"week": "11"}) == (404, "Week 11 isn't on the schedule yet")


def test_no_schedule_yet(app):
    assert call(app("nfl_week"), DOM) == (404, "The NFL schedule isn't loaded yet")
