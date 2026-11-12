from datetime import datetime, timezone

from lambdas.common import clock, groups

NOW = datetime(2026, 11, 13, 12, 0, tzinfo=timezone.utc)


def seed(store, week, lock_at):
    store.set_current(2026, week)
    store.save_week(2026, week, lock_at, "g1", ["g1"], "2026-11-01T00:00:00Z")


def test_current_week_counts_once_its_lock_passes(store, monkeypatch):
    monkeypatch.setattr(clock, "now", lambda group=None: NOW)
    seed(store, 10, "2026-11-13T01:15:00Z")
    assert groups.last_locked_week(2026) == 10
    assert groups.next_unlocked_week(2026) == 11


def test_before_lock_the_previous_week_is_last(store, monkeypatch):
    monkeypatch.setattr(clock, "now", lambda group=None: NOW)
    seed(store, 11, "2026-11-20T01:15:00Z")
    assert groups.last_locked_week(2026) == 10


def test_no_data_or_future_season(store, monkeypatch):
    monkeypatch.setattr(clock, "now", lambda group=None: NOW)
    assert groups.last_locked_week(2026) is None
    seed(store, 1, "2026-09-11T00:20:00Z")
    assert groups.last_locked_week(2027) is None
    assert groups.last_locked_week(2025) == 18


def test_clock_reads_group_override():
    assert clock.now({"clock": "2026-10-01T17:00:00Z"}) == datetime(2026, 10, 1, 17, tzinfo=timezone.utc)
    assert clock.now({}).tzinfo is timezone.utc
