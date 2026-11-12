import gzip
import io
import json
from pathlib import Path

from lambdas.common import nflverse

FIXTURES = Path(__file__).parent / "fixtures"
CSV = (FIXTURES / "nflverse" / "games.csv").read_text()


def test_season_filter_and_espn_key():
    rows = nflverse.games(CSV, 2026)
    assert set(rows) == {"401872988", "401872989", "401873052", "401873061"}
    assert rows["401873052"]["nflverseId"] == "2026_10_WAS_NYG"


def test_tie_is_result_zero():
    tie = nflverse.games(CSV, 2026)["401872988"]
    assert (tie["away"], tie["home"]) == ("NYG", "WSH")
    assert tie["final"] and tie["tie"]
    assert tie["winner"] is None
    assert (tie["awayScore"], tie["homeScore"]) == (27, 27)


def test_away_win():
    g = nflverse.games(CSV, 2026)["401872989"]
    assert g["winner"] == "DEN" and not g["tie"]


def test_unplayed_game_is_not_final():
    g = nflverse.games(CSV, 2026)["401873061"]
    assert g["away"] == "LAR"
    assert not g["final"] and not g["tie"]
    assert g["winner"] is None and g["homeScore"] is None


def test_spread_matches_espn_sign():
    rows = nflverse.games(CSV, 2026)
    espn = {
        e["id"]: e["competitions"][0]["odds"][0]
        for e in json.loads((FIXTURES / "espn" / "scoreboard-2026-w10.json").read_text())["events"]
    }
    # NYG -2.5 at home: nflverse 2.5, ESPN -2.5.
    assert rows["401873052"]["spread"] == espn["401873052"]["spread"] == -2.5
    assert rows["401873052"]["overUnder"] == espn["401873052"]["overUnder"]
    # LAR -9.5 on the road at ARI: nflverse -9.5, ESPN +9.5.
    assert rows["401873061"]["spread"] == 9.5


def test_fetch_decompresses_the_release_asset(monkeypatch):
    class Resp(io.BytesIO):
        def __enter__(self):
            return self

        def __exit__(self, *exc):
            return False

    seen = {}

    def urlopen(req, timeout):
        seen["url"] = req.full_url
        return Resp(gzip.compress(CSV.encode()))

    monkeypatch.setattr(nflverse.urllib.request, "urlopen", urlopen)
    assert nflverse.fetch() == CSV
    assert seen["url"].endswith("/releases/download/schedules/games.csv.gz")
