import urllib.error
from pathlib import Path

import pytest

from lambdas.common import gow, nfl_store, nflverse
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
        table().put_item(Item={"PK": f"GROUP#{gid}#S{season}#W10", "SK": f"PICK#{DOM['sub']}", "sub": DOM["sub"], "picks": picks, "complete": False})


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
    table().put_item(Item={"PK": "GROUP#g1#S2026#W10", "SK": f"PICK#{PAT['sub']}", "sub": PAT["sub"], "picks": {}, "complete": True})
    table().put_item(Item=gow.item("GROUP#g1#S2026#W10", "401873052", "auto", "2026-11-10T17:00:00Z"))

    data = call(api, DOM)[1]
    assert data["groups"] == [
        {
            "groupId": "g1", "name": "Office", "replay": False, "picks": {"401873052": {"team": "NYG", "conf": 2}},
            "complete": False, "role": "owner", "gow": {"gameId": "401873052", "chosenBy": "auto"},
        },
        {"groupId": "g2", "name": "Replay", "replay": True, "picks": None, "complete": False, "role": "owner", "gow": None},
    ]
    assert data["gowDeadline"] == nfl_store.iso(gow.deadline(data["lockAt"]))
    assert data["gowDeadline"] < data["lockAt"]


def test_week_param(api):
    assert call(api, DOM, query={"week": "10"})[1]["week"] == 10
    assert call(api, DOM, query={"week": "19"})[0] == 400
    assert call(api, DOM, query={"week": "11"}) == (404, "Week 11 isn't on the schedule yet")


def test_no_schedule_yet(app):
    assert call(app("nfl_week"), DOM) == (404, "The NFL schedule isn't loaded yet")


def replay(week, gid, away, home, kickoff, score):
    nfl_store.save_replay(2026, {week: [{
        "gameId": gid, "kickoff": kickoff, "timeValid": True,
        "away": {"abbr": away, "logo": None}, "home": {"abbr": home, "logo": None},
        "lines": {"provider": "nflverse", "details": None, "spread": -3.5, "overUnder": 44.5},
        "awayScore": score[0], "homeScore": score[1], "winner": away if score[0] > score[1] else home,
        "tie": False, "final": True, "snapshots": [],
    }]}, "2026-11-12T00:00:00Z")


def test_a_week_before_launch_comes_from_the_replay_finals(api):
    replay(9, "401873040", "KC", "DEN", "2026-11-02T18:00:00Z", (20, 24))
    group("g1", "Office")
    data = call(api, DOM)[1]
    assert (data["weeks"], data["archived"]) == ([9, 10], False)

    status, data = call(api, DOM, query={"week": "9"})
    assert status == 200 and data["archived"] is True and data["groups"] == []
    (g,) = data["games"]
    assert (g["state"], g["completed"], g["awayScore"], g["homeScore"], g["winner"]) == ("post", True, 20, 24, "DEN")
    assert g["lines"]["spread"] == -3.5


def test_replay_rows_after_the_current_week_stay_off_the_slate(api):
    replay(11, "401873070", "KC", "DEN", "2026-11-20T18:00:00Z", (20, 24))
    assert call(api, DOM)[1]["weeks"] == [10]
    assert call(api, DOM, query={"week": "11"}) == (404, "Week 11 isn't on the schedule yet")
