from datetime import datetime, timezone

from lambdas.common import clock, groups

NOW = datetime(2026, 11, 13, 12, 0, tzinfo=timezone.utc)
LIVE = {"season": 2026}


def seed(store, week, lock_at):
    store.set_current(2026, week)
    store.save_week(2026, week, lock_at, "g1", ["g1"], "2026-11-01T00:00:00Z")


def last(store, group):
    return store.for_group(group).last_locked_week()


def test_current_week_counts_once_its_lock_passes(store, monkeypatch):
    monkeypatch.setattr(clock, "now", lambda group=None: NOW)
    seed(store, 10, "2026-11-13T01:15:00Z")
    assert last(store, LIVE) == 10
    assert groups.next_unlocked_week(LIVE) == 11


def test_before_lock_the_previous_week_is_last(store, monkeypatch):
    monkeypatch.setattr(clock, "now", lambda group=None: NOW)
    seed(store, 11, "2026-11-20T01:15:00Z")
    assert last(store, LIVE) == 10


def test_no_data_or_future_season(store, monkeypatch):
    monkeypatch.setattr(clock, "now", lambda group=None: NOW)
    assert last(store, LIVE) is None
    seed(store, 1, "2026-09-11T00:20:00Z")
    assert last(store, {"season": 2027}) is None
    assert last(store, {"season": 2025}) == 18


def replay_week(week, kickoff):
    return [{"gameId": str(week), "kickoff": kickoff, "lines": {}, "away": {"abbr": "A"}, "home": {"abbr": "B"}}]


def test_replay_group_reads_replay_rows_on_its_own_clock(store):
    # The live season is at Week 10; the replay group is back in September.
    seed(store, 10, "2026-11-13T01:15:00Z")
    store.save_replay(2026, {1: replay_week(1, "2026-09-11T00:20:00Z"), 2: replay_week(2, "2026-09-18T00:15:00Z")}, "x")
    group = {"season": 2026, "replay": True, "clock": "2026-09-12T00:00:00Z"}
    feed = store.for_group(group)
    assert feed.last_locked_week() == 1
    assert groups.next_unlocked_week(group) == 2
    assert feed.week(2)["lockAt"] == "2026-09-18T00:15:00Z"
    assert not feed.locked(feed.week(2))
    assert [g["gameId"] for g in feed.games(1)] == ["1"]
    assert store.for_group({**group, "clock": "2026-09-01T00:00:00Z"}).last_locked_week() is None


def test_clock_reads_group_override():
    assert clock.now({"clock": "2026-10-01T17:00:00Z"}) == datetime(2026, 10, 1, 17, tzinfo=timezone.utc)
    assert clock.now({}).tzinfo is timezone.utc
