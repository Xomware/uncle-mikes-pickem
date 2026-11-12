import boto3


def game(gid, kickoff, **extra):
    return {"gameId": gid, "kickoff": kickoff, "status": "STATUS_SCHEDULED", **extra}


def test_list_games_orders_by_kickoff_then_event_id(store):
    store.save_game(2026, 10, game("401873064", "2026-11-16T01:20:00Z"))
    store.save_game(2026, 10, game("401873058", "2026-11-15T18:00:00Z"))
    store.save_game(2026, 10, game("401873056", "2026-11-15T18:00:00Z"))
    store.save_game(2026, 11, game("401873066", "2026-11-20T01:15:00Z"))
    assert [g["gameId"] for g in store.list_games(2026, 10)] == ["401873056", "401873058", "401873064"]


def test_save_game_keeps_attributes_it_was_not_given(store):
    store.save_game(2026, 10, game("1", "2026-11-15T18:00:00Z", lines={"spread": -2.5}))
    boto3.resource("dynamodb").Table("nfl").update_item(
        Key={"PK": "SEASON#2026#W10", "SK": "GAME#1"},
        UpdateExpression="SET homeScore = :s",
        ExpressionAttributeValues={":s": 24},
    )
    store.save_game(2026, 10, {"gameId": "1", "status": "STATUS_FINAL"})
    [g] = store.list_games(2026, 10)
    assert g["status"] == "STATUS_FINAL"
    assert g["homeScore"] == 24
    assert g["lines"] == {"spread": -2.5}


def test_week_recomputes_until_lock_then_freezes(store):
    assert store.get_week(2026, 10) is None
    assert store.save_week(2026, 10, "2026-11-13T01:15:00Z", "b", ["a", "b"], now="2026-11-12T12:00:00Z")
    # Flexed earlier before the lock passed: recomputed.
    assert store.save_week(2026, 10, "2026-11-13T00:15:00Z", "b", ["a", "b"], now="2026-11-12T13:00:00Z")
    # After the stored lock: frozen, lock and tiebreak both.
    assert not store.save_week(2026, 10, "2026-11-15T18:00:00Z", "c", ["b", "c"], now="2026-11-13T00:15:00Z")
    week = store.get_week(2026, 10)
    assert week["lockAt"] == "2026-11-13T00:15:00Z"
    assert week["tiebreakGameId"] == "b"
    assert week["week"] == 10


def test_current_week(store):
    assert store.current_week() is None
    store.set_current(2026, 10)
    assert store.current_week() == (2026, 10)


def test_plain_converts_decimals(store):
    from decimal import Decimal

    assert store.plain({"a": [Decimal("3"), Decimal("-2.5")]}) == {"a": [3, -2.5]}
