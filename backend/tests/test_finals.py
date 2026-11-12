import copy
import json
from datetime import datetime, timedelta, timezone
from pathlib import Path

import boto3
import pytest

from lambdas.common import finals
from tests.test_cron_tick import board, serve, tick  # noqa: F401  (tick is a fixture)

CSV = (Path(__file__).parent / "fixtures" / "nflverse" / "games.csv").read_text()
TNF = "401873052"  # WSH @ NYG
NOW = datetime(2026, 11, 13, 5, 0, tzinfo=timezone.utc)


def espn_final(away=17, home=20):
    return {"gameId": TNF, "completed": True, "awayScore": away, "homeScore": home}


def verse(away, home):
    return {"final": True, "awayScore": away, "homeScore": home}


def test_agreement_confirms():
    out = finals.check(espn_final(), verse(17, 20), NOW)
    assert out == {"finalAt": "2026-11-13T05:00:00Z", "confirmedBy": ["espn", "nflverse"], "flag": None}


def test_no_nflverse_row_yet_is_provisional():
    assert finals.check(espn_final(), None, NOW) == {"finalAt": "2026-11-13T05:00:00Z", "confirmedBy": ["espn"]}
    assert finals.check(espn_final(), {"final": False}, NOW)["confirmedBy"] == ["espn"]


def test_disagreement_flags():
    out = finals.check(espn_final(), verse(17, 23), NOW)
    assert out["confirmedBy"] == ["espn"]
    assert out["flag"] == "nflverse has 17-23, ESPN 17-20"


def test_six_hours_unconfirmed_flags_from_first_final():
    game = {**espn_final(), "finalAt": "2026-11-13T05:00:00Z"}
    assert "flag" not in finals.check(game, None, NOW + timedelta(hours=5, minutes=59))
    out = finals.check(game, None, NOW + timedelta(hours=6))
    assert out["finalAt"] == "2026-11-13T05:00:00Z"
    assert "6 h" in out["flag"]


def test_settled():
    assert not finals.settled({"confirmedBy": ["espn"]})
    assert finals.settled({"confirmedBy": ["espn", "nflverse"]})
    assert finals.settled({"confirmedBy": ["espn"], "flag": "x"})


def final_board(away=17, home=20):
    b = copy.deepcopy(board(10))
    event = next(e for e in b["events"] if e["id"] == TNF)
    c = event["competitions"][0]
    c["status"]["type"] = {"name": "STATUS_FINAL", "state": "post", "completed": True}
    for t in c["competitors"]:
        t["score"] = str(home if t["homeAway"] == "home" else away)
        t["winner"] = (home > away) == (t["homeAway"] == "home") and home != away
    return b


@pytest.fixture
def alarms(monkeypatch):
    """The pickem-alarms topic with an SQS subscriber, so a test can read what was published."""
    topic = boto3.client("sns").create_topic(Name="alarms")["TopicArn"]
    sqs = boto3.client("sqs")
    url = sqs.create_queue(QueueName="alarms")["QueueUrl"]
    arn = sqs.get_queue_attributes(QueueUrl=url, AttributeNames=["QueueArn"])["Attributes"]["QueueArn"]
    boto3.client("sns").subscribe(TopicArn=topic, Protocol="sqs", Endpoint=arn)
    monkeypatch.setenv("ALARMS_TOPIC_ARN", topic)

    def read():
        msgs = sqs.receive_message(QueueUrl=url, MaxNumberOfMessages=10).get("Messages", [])
        return [json.loads(m["Body"])["Message"] for m in msgs]

    return read


def nflverse_says(monkeypatch, tick, away, home):
    played = CSV.replace("WAS,,NYG,,Home,,,,", f"WAS,{away},NYG,{home},Home,{home - away},{home + away},0,")
    fetches = []
    monkeypatch.setattr(tick.nflverse, "fetch", lambda: fetches.append(1) or played)
    return fetches


def tnf(store):
    return next(g for g in store.list_games(2026, 10) if g["gameId"] == TNF)


def test_espn_final_then_nflverse_confirms(tick, store, monkeypatch, alarms):
    serve(monkeypatch, tick, [final_board(), board(11)])
    fetches = nflverse_says(monkeypatch, tick, 17, 20)
    out = tick.handler({"force": True}, None)
    game = tnf(store)
    assert (game["awayScore"], game["homeScore"], game["winner"], game["tie"]) == (17, 20, "NYG", False)
    assert game["status"] == "STATUS_FINAL"
    assert game["confirmedBy"] == ["espn", "nflverse"]
    assert out["flagged"] == [] and alarms() == []
    # One fetch for the tick, and none once the game is confirmed.
    tick.handler({"force": True}, None)
    assert len(fetches) == 1


def test_disagreement_flags_and_alerts_once(tick, store, monkeypatch, alarms):
    serve(monkeypatch, tick, [final_board(), board(11)])
    nflverse_says(monkeypatch, tick, 17, 23)
    tick.handler({"force": True}, None)
    game = tnf(store)
    assert game["confirmedBy"] == ["espn"]
    assert game["flag"] == "nflverse has 17-23, ESPN 17-20"
    [message] = alarms()
    assert "WSH @ NYG (401873052)" in message

    tick.handler({"force": True}, None)
    assert alarms() == []

    # ESPN corrects its final: agreement clears the flag.
    serve(monkeypatch, tick, [final_board(17, 23), board(11)])
    tick.handler({"force": True}, None)
    game = tnf(store)
    assert game["confirmedBy"] == ["espn", "nflverse"] and game["flag"] is None


def test_tie_has_no_winner(tick):
    game = tick.game_fields(next(e for e in final_board(20, 20)["events"] if e["id"] == TNF))
    assert game["tie"] is True and game["winner"] is None


def test_unsettled_final_keeps_the_window_open(tick):
    at = datetime(2026, 11, 13, 9, 31, tzinfo=timezone.utc)
    final = {"kickoff": "2026-11-13T01:15:00Z", "completed": True, "confirmedBy": ["espn"]}
    assert tick.choose_mode(at, [final], False) == "live"
    assert tick.choose_mode(at, [{**final, "flag": "x"}], False) is None
