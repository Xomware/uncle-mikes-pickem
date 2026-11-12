import gzip
import json
from pathlib import Path

import boto3
import pytest

from lambdas.common import nflverse
from tests.conftest import DOM, PAT, call, table

FIXTURES = Path(__file__).parent / "fixtures"
CSV = (FIXTURES / "nflverse" / "games.csv").read_text()
BOARD = json.loads((FIXTURES / "espn" / "scoreboard-2026-w10.json").read_text())
SUMMARY = (FIXTURES / "espn" / "summary-401873052.json").read_bytes()
TNF = "401873052"  # WSH @ NYG, 2026-11-13T01:15Z
SNAP = "raw/season=2026/type=2/week=10/2026-11-12T140012Z"


@pytest.fixture
def info(app, monkeypatch):
    monkeypatch.setenv("CAPTURE_BUCKET", "cap")
    module = app("games_info")
    monkeypatch.setattr(module, "s3", boto3.client("s3"))
    monkeypatch.setattr(nflverse, "fetch", lambda: CSV)
    module.espn_calls = []

    def get(url):
        module.espn_calls.append(url)
        return 200, SUMMARY

    monkeypatch.setattr(module.espn, "get", get)
    return module


def group(gid, clock, replay=False, members=(DOM,)):
    table().put_item(Item={"PK": f"GROUP#{gid}", "SK": "META", "groupId": gid, "name": gid, "season": 2026, "replay": replay, "clock": clock})
    for m in members:
        table().put_item(Item={"PK": f"GROUP#{gid}", "SK": f"MEMBER#{m['sub']}", "sub": m["sub"], "name": m["name"], "role": "owner"})


def seed_live():
    from lambdas.common import nfl_store
    from lambdas.cron_tick.handler import game_fields

    event = next(e for e in BOARD["events"] if e["id"] == TNF)
    event = {**event, "weather": {"displayValue": "Showers", "temperature": 52, "conditionId": "12"}}
    nfl_store.save_game(2026, 10, game_fields(event))


def get(info, gid, game_id=TNF, who=DOM):
    return call(info, who, query={"groupId": gid, "gameId": game_id})


def test_live_game_distills_the_summary(info):
    seed_live()
    group("live", "2026-11-12T18:00:00Z")
    status, data = get(info, "live")
    assert status == 200
    game, away, home = data["game"], data["away"], data["home"]
    assert (game["week"], game["kickoff"], game["state"]) == (10, "2026-11-13T01:15:00Z", "pre")
    assert game["lines"]["details"] == "NYG -2.5" and game["lines"]["homeMoneyline"] == -135
    assert game["venue"] == {"name": "MetLife Stadium", "city": "East Rutherford", "state": "NJ", "grass": False, "roof": "outdoors"}
    assert game["broadcasts"] == ["Prime Video"]

    assert (home["abbr"], home["name"], home["record"], home["split"]) == ("NYG", "New York Giants", "5-2-1", "3-1")
    assert home["color"] == "003c7f" and home["logo"].endswith("/nyg.png")
    assert [f["result"] for f in home["form"]] == ["W", "T", "L", "W", "W"]
    assert home["form"][1] == {"week": 5, "atVs": "@", "opponent": "WSH", "result": "T", "score": "27-27 OT"}

    assert [i["status"] for i in home["injuries"]] == ["Out", "Out", "Questionable", "Questionable", "IR"]
    tracy = home["injuries"][-1]
    assert (tracy["name"], tracy["position"], tracy["detail"]) == ("Tyrone Tracy Jr.", "RB", "Hamstring, Strain")
    # No headshot in the summary: the ESPN headshot path by athlete id stands in.
    hood = next(i for i in home["injuries"] if i["name"] == "Colton Hood")
    assert hood["headshot"] == "https://a.espncdn.com/i/headshots/nfl/players/full/4921249.png" and hood["detail"] is None
    assert away["abbr"] == "WSH" and len(away["injuries"]) == 5

    assert data["weather"] == {"temperature": 52, "high": 52, "low": 52, "gust": 14, "precipitation": 64, "description": "Showers"}
    assert data["headToHead"] == [{
        "season": 2026, "week": 5, "gameType": "REG", "kickoff": "2026-10-11T17:00:00Z",
        "away": "NYG", "home": "WSH", "awayScore": 27, "homeScore": 27,
    }]
    assert data["source"] == {"kind": "espn", "at": "2026-11-12T18:00:00Z"}


def test_live_build_is_cached_for_30_minutes(info):
    seed_live()
    group("live", "2026-11-12T18:00:00Z")
    get(info, "live")
    table().update_item(Key={"PK": "GROUP#live", "SK": "META"}, UpdateExpression="SET clock = :c", ExpressionAttributeValues={":c": "2026-11-12T18:29:00Z"})
    assert get(info, "live")[1]["source"]["at"] == "2026-11-12T18:00:00Z"
    table().update_item(Key={"PK": "GROUP#live", "SK": "META"}, UpdateExpression="SET clock = :c", ExpressionAttributeValues={":c": "2026-11-12T18:31:00Z"})
    assert get(info, "live")[1]["source"]["at"] == "2026-11-12T18:31:00Z"
    assert len(info.espn_calls) == 2


def test_dome_games_drop_weather(info, monkeypatch):
    seed_live()
    group("live", "2026-11-12T18:00:00Z")
    monkeypatch.setattr(nflverse, "fetch", lambda: CSV.replace(",outdoors,", ",dome,"))
    status, data = get(info, "live")
    assert data["game"]["venue"]["roof"] == "dome" and data["weather"] is None


def test_members_only_and_bad_ids(info):
    seed_live()
    group("live", "2026-11-12T18:00:00Z")
    assert get(info, "live", who=PAT) == (404, "Group not found")
    assert get(info, "nope") == (404, "Group not found")
    assert get(info, "live", game_id="999") == (404, "That game isn't on this season's schedule")
    assert get(info, "live", game_id="1 OR 1")[0] == 400
    assert info.espn_calls == []


def test_espn_failure_is_a_502(info, monkeypatch):
    seed_live()
    group("live", "2026-11-12T18:00:00Z")
    monkeypatch.setattr(info.espn, "get", lambda url: (503, b""))
    assert get(info, "live")[0] == 502


@pytest.fixture
def replay(info, monkeypatch):
    s3 = boto3.client("s3")
    s3.create_bucket(Bucket="cap")
    s3.put_object(Bucket="cap", Key=f"{SNAP}/scoreboard.json.gz", Body=gzip.compress(json.dumps(BOARD).encode()))
    s3.put_object(Bucket="cap", Key=f"{SNAP}/summary-{TNF}.json.gz", Body=gzip.compress(SUMMARY))
    from lambdas.replay_load import handler as loader

    monkeypatch.setattr(loader, "s3", s3)
    loader.handler({}, None)
    return info


def test_replay_before_any_capture_says_so(replay):
    group("r", "2026-11-12T13:00:00Z", replay=True)
    status, data = get(replay, "r")
    assert status == 200
    assert data["source"]["kind"] == "none" and "No ESPN snapshot" in data["source"]["note"]
    assert data["home"]["injuries"] == [] and data["home"]["form"] == []
    assert data["game"]["lines"]["provider"] == "nflverse"
    assert data["headToHead"][0]["season"] == 2026
    assert replay.espn_calls == []


def test_replay_reads_the_capture_before_its_clock(replay):
    group("r", "2026-11-12T15:00:00Z", replay=True)
    status, data = get(replay, "r")
    assert data["source"] == {"kind": "capture", "at": "2026-11-12T14:00:12Z"}
    assert data["home"]["record"] == "5-2-1" and len(data["away"]["injuries"]) == 5
    assert data["game"]["state"] == "pre" and data["game"]["homeScore"] is None
    assert replay.espn_calls == []
