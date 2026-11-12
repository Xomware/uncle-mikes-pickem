import gzip
import json
from datetime import datetime, timezone

import boto3
import pytest
from moto import mock_aws

NOW = datetime(2026, 11, 15, 17, 20, tzinfo=timezone.utc)


def game(gid, kickoff, state="pre"):
    return {"id": gid, "date": kickoff, "status": {"type": {"state": state}}}


@pytest.fixture
def capture(monkeypatch):
    monkeypatch.setenv("CAPTURE_BUCKET", "cap")
    monkeypatch.setenv("AWS_DEFAULT_REGION", "us-east-1")
    with mock_aws():
        boto3.client("s3").create_bucket(Bucket="cap")
        from lambdas.capture import handler

        monkeypatch.setattr(handler, "s3", boto3.client("s3"))
        yield handler


def test_mode_prekick_only_inside_window(capture):
    soon = [game("1", "2026-11-15T18:00Z")]
    later = [game("1", "2026-11-15T21:25Z")]
    started = [game("1", "2026-11-15T17:00Z", state="in")]
    assert capture.choose_mode(NOW, soon, False) == "prekick"
    assert capture.choose_mode(NOW, later, False) is None
    assert capture.choose_mode(NOW, started, False) is None


def test_mode_daily_and_force(capture):
    assert capture.choose_mode(NOW.replace(hour=14, minute=5), [], False) == "daily"
    assert capture.choose_mode(NOW.replace(hour=14, minute=35), [], False) is None
    assert capture.choose_mode(NOW, [], True) == "force"


def test_prekick_skips_league_feeds(capture):
    urls = capture.sources(2026, [game("9", "x")], "prekick")
    assert set(urls) == {"summary-9", "gambit-pickem", "gambit-survivor"}
    assert "standings" in capture.sources(2026, [], "daily")


def fake_get(failing=()):
    board = {
        "season": {"year": 2026, "type": 2},
        "week": {"number": 10},
        "events": [game("401", "2026-11-15T18:00Z")],
    }

    def get(url):
        if url.endswith("/scoreboard"):
            return 200, json.dumps(board).encode()
        if any(f in url for f in failing):
            return 403, b"no"
        return 200, b'{"ok": true}'

    return get


def keys():
    return [o["Key"] for o in boto3.client("s3").list_objects_v2(Bucket="cap").get("Contents", [])]


def test_force_writes_slate_and_manifest(capture, monkeypatch):
    monkeypatch.setattr(capture.espn, "get", fake_get())
    out = capture.handler({"force": True}, None)
    assert out["mode"] == "force"
    names = {k.rsplit("/", 1)[1] for k in keys()}
    assert names == {
        "scoreboard.json.gz", "summary-401.json.gz", "gambit-pickem.json.gz",
        "gambit-survivor.json.gz", "injuries.json.gz", "standings.json.gz", "manifest.json.gz",
    }
    assert all(k.startswith("raw/season=2026/type=2/week=10/") for k in keys())


def test_failed_fetch_keeps_rest_then_raises(capture, monkeypatch):
    monkeypatch.setattr(capture.espn, "get", fake_get(failing=("survivor",)))
    with pytest.raises(RuntimeError, match="1 fetches failed"):
        capture.handler({"force": True}, None)
    manifest_key = next(k for k in keys() if k.endswith("manifest.json.gz"))
    body = boto3.client("s3").get_object(Bucket="cap", Key=manifest_key)["Body"].read()
    files = json.loads(gzip.decompress(body))["files"]
    assert [f["status"] for f in files if f["name"] == "gambit-survivor"] == [403]
    assert not any("survivor" in k for k in keys())
