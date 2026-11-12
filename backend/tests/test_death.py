import pytest

from lambdas.common.death import check_pick, fold
from lambdas.common.rules import new_version

SECOND_LIFE = [new_version([], {"deathSecondLife": True}, 1)]


def test_loss_eliminates_win_survives():
    out = fold({"a": {1: "KC"}, "b": {1: "BUF"}}, {1: {"KC": "W", "BUF": "L"}}, [])
    assert out["entries"]["b"]["eliminatedWeek"] == 1
    assert out["winners"] == ["a"]


def test_tie_is_a_loss_by_default_and_a_setting():
    entries = {"a": {1: "KC"}, "b": {1: "DAL"}, "c": {1: "NYG"}}
    results = {1: {"KC": "W", "DAL": "T", "NYG": "T"}}
    assert fold(entries, results, [])["winners"] == ["a"]
    survive = [new_version([], {"deathTie": "win"}, 1)]
    assert fold(entries, results, survive)["entries"]["b"]["eliminatedWeek"] is None


def test_missed_pick_eliminates():
    out = fold({"a": {1: "KC"}, "b": {}, "c": {1: "GB"}}, {1: {"KC": "W", "GB": "W"}}, [])
    assert out["entries"]["b"]["eliminatedWeek"] == 1


def test_missed_pick_uses_second_life():
    entries = {"a": {1: "KC", 2: "GB"}, "b": {2: "SF"}, "c": {}}
    out = fold(entries, {1: {"KC": "W", "PHI": "W"}, 2: {"GB": "W", "SF": "W"}}, SECOND_LIFE)
    assert out["entries"]["b"] == {"lives": 1, "eliminatedWeek": None}
    assert out["entries"]["c"] == {"lives": 0, "eliminatedWeek": 2}


def test_all_eliminated_same_week_revive():
    entries = {"a": {1: "KC", 2: "GB"}, "b": {1: "PHI", 2: "SF"}, "c": {1: "BUF"}}
    results = {1: {"KC": "W", "PHI": "W", "BUF": "L"}, 2: {"GB": "L", "SF": "L"}}
    out = fold(entries, results, [])
    assert out["entries"]["a"]["eliminatedWeek"] is None
    assert out["entries"]["b"]["eliminatedWeek"] is None
    assert out["entries"]["c"]["eliminatedWeek"] == 1
    assert out["winners"] == []


def test_all_lose_with_spare_lives_spend_them_instead_of_reviving():
    entries = {"a": {1: "KC"}, "b": {1: "GB"}}
    out = fold(entries, {1: {"KC": "L", "GB": "L"}}, SECOND_LIFE)
    assert out["entries"] == {
        "a": {"lives": 1, "eliminatedWeek": None},
        "b": {"lives": 1, "eliminatedWeek": None},
    }


def test_all_lose_mixed_lives_last_life_goes_out():
    # Revive only applies when every remaining entry was on its last life.
    entries = {"a": {1: "KC", 2: "DAL"}, "b": {1: "GB", 2: "NYG"}}
    results = {1: {"KC": "L", "GB": "W"}, 2: {"DAL": "L", "NYG": "L"}}
    out = fold(entries, results, SECOND_LIFE)
    assert out["entries"]["a"] == {"lives": 0, "eliminatedWeek": 2}
    assert out["entries"]["b"] == {"lives": 1, "eliminatedWeek": None}
    assert out["winners"] == ["b"]


def test_all_lose_on_last_life_with_second_life_on_revives():
    entries = {"a": {1: "KC", 2: "DAL"}, "b": {1: "GB", 2: "NYG"}}
    results = {1: {"KC": "L", "GB": "L"}, 2: {"DAL": "L", "NYG": "L"}}
    out = fold(entries, results, SECOND_LIFE)
    assert all(e == {"lives": 1, "eliminatedWeek": None} for e in out["entries"].values())


def test_pool_stops_at_one_entry():
    entries = {"a": {1: "KC", 2: "GB"}, "b": {1: "BUF"}}
    out = fold(entries, {1: {"KC": "W", "BUF": "L"}, 2: {"GB": "L"}}, [])
    assert out["entries"]["a"]["eliminatedWeek"] is None
    assert out["winners"] == ["a"]


def test_split_after_week_18():
    teams = [f"T{w}" for w in range(1, 19)]
    entries = {"a": dict(enumerate(teams, 1)), "b": dict(enumerate(teams, 1))}
    results = {w: {f"T{w}": "W"} for w in range(1, 19)}
    assert fold(entries, results, [])["winners"] == ["a", "b"]
    del results[18]
    assert fold(entries, results, [])["winners"] == []


def test_team_once_per_season():
    check_pick({1: "KC"}, 1, "GB")  # changing this week's pick is fine
    check_pick({1: "KC", 2: "GB"}, 2, "SF")
    with pytest.raises(ValueError):
        check_pick({1: "KC"}, 2, "KC")
