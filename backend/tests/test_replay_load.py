import gzip
import json
from datetime import datetime, timedelta, timezone
from pathlib import Path

import boto3
import pytest

from lambdas.common import nflverse

FIXTURES = Path(__file__).parent / "fixtures"
CSV = (FIXTURES / "nflverse" / "games.csv").read_text()
BOARD = (FIXTURES / "espn" / "scoreboard-2026-w10.json").read_bytes()
SNAP = "raw/season=2026/type=2/week=10/2026-11-12T140012Z"
TNF = "401873052"  # 2026_10_WAS_NYG, Thursday 20:15 ET


def utc(*args):
    return datetime(*args, tzinfo=timezone.utc)


@pytest.fixture
def loader(store, monkeypatch):
    monkeypatch.setenv("CAPTURE_BUCKET", "cap")
    s3 = boto3.client("s3")
    s3.create_bucket(Bucket="cap")
    s3.put_object(Bucket="cap", Key=f"{SNAP}/scoreboard.json.gz", Body=gzip.compress(BOARD))
    s3.put_object(Bucket="cap", Key=f"{SNAP}/injuries.json.gz", Body=gzip.compress(b"{}"))
    from lambdas.replay_load import handler

    monkeypatch.setattr(handler, "s3", s3)
    monkeypatch.setattr(nflverse, "fetch", lambda: CSV)
    assert handler.handler({}, None) == {"weeks": 2, "games": 4, "captures": 1}
    return store


def test_kickoff_is_eastern_wall_clock_in_utc():
    assert nflverse.kickoff("2026-11-12", "20:15") == "2026-11-13T01:15:00Z"  # EST
    assert nflverse.kickoff("2026-10-11", "13:00") == "2026-10-11T17:00:00Z"  # EDT


def test_unset_week_18_time_is_a_placeholder():
    text = CSV.replace("2026-11-15,Sunday,16:05", "2026-11-15,Sunday,")
    g = nflverse.games(text, 2026)["401873061"]
    assert g["kickoff"] == "2026-11-15T18:00:00Z" and not g["timeValid"]
    assert nflverse.games(CSV, 2026)["401873061"]["timeValid"]


def test_rows_live_under_replay_keys_not_the_real_season(loader):
    assert loader.get_week(2026, 10) is None
    week = loader.get_replay_week(2026, 10)
    assert week["lockAt"] == "2026-11-13T01:15:00Z"
    assert week["gameIds"] == [TNF, "401873061"]
    assert loader.replay_lock_ats(2026) == {5: "2026-10-11T17:00:00Z", 10: "2026-11-13T01:15:00Z"}


def test_results_hidden_until_kickoff_plus_delay(loader):
    kickoff = utc(2026, 10, 11, 17)
    before = {g["gameId"]: g for g in loader.games_as_of(2026, 5, kickoff + timedelta(hours=3))}
    tie = before["401872988"]
    assert tie["state"] == "in" and not tie["completed"]
    assert tie["homeScore"] is None and not tie["final"] and not tie["tie"]

    after = {g["gameId"]: g for g in loader.games_as_of(2026, 5, kickoff + loader.RESULT_DELAY)}
    tie = after["401872988"]
    assert tie["state"] == "post" and tie["completed"]
    assert (tie["awayScore"], tie["homeScore"], tie["tie"], tie["winner"]) == (27, 27, True, None)
    assert after["401872989"]["state"] == "in"  # the 16:05 ET game


def test_capture_line_only_after_its_snapshot(loader):
    def tnf(now):
        return next(g for g in loader.games_as_of(2026, 10, now) if g["gameId"] == TNF)

    early = tnf(utc(2026, 11, 12, 13))
    assert early["lines"]["provider"] == "nflverse" and early["lines"]["spread"] == -2.5
    assert "capturePrefix" not in early and "snapshots" not in early

    late = tnf(utc(2026, 11, 12, 15))
    assert late["capturePrefix"] == SNAP and late["capturedAt"] == "2026-11-12T14:00:12Z"
    assert late["lines"]["provider"] != "nflverse"
    assert late["state"] == "pre"


def test_teams_take_logos_and_colors_from_captures(loader):
    # NYG and WSH are on the captured Week 10 board, so Week 5's game gets their colors too.
    nyg_was = next(g for g in loader.games_as_of(2026, 5, utc(2026, 9, 1)) if g["gameId"] == "401872988")
    assert nyg_was["away"]["color"] == "003c7f"
    assert nyg_was["home"]["logo"] == "https://a.espncdn.com/i/teamlogos/nfl/500/scoreboard/wsh.png"
    # DEN never appears in a capture: the CDN logo stands in and the UI falls back to a plain badge.
    den = next(g for g in loader.games_as_of(2026, 5, utc(2026, 9, 1)) if g["gameId"] == "401872989")["away"]
    assert den == {"abbr": "DEN", "logo": "https://a.espncdn.com/i/teamlogos/nfl/500/den.png"}


def test_weeks_without_captures_keep_hype_from_closing_lines(loader):
    games = loader.games_as_of(2026, 5, utc(2026, 9, 1))
    assert all(g["hype"]["components"]["spread"] is not None for g in games)
