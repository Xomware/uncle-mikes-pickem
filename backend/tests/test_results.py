import json
from pathlib import Path

import boto3
import pytest
from boto3.dynamodb.conditions import Key

from lambdas.common import results
from lambdas.common.grade import TIE
from tests.conftest import create_table, seed_week, table

SHEET = json.loads((Path(__file__).parents[2] / "fixtures" / "sheet-2026-w9.json").read_text())


def games(n):
    """n games, each won at home 21-14; the last is the MNF tiebreak at 35 total."""
    return [
        {"gameId": f"g{i:02d}", "away": {"abbr": f"A{i}"}, "home": {"abbr": f"H{i}"},
         "completed": True, "awayScore": 14, "homeScore": 21, "confirmedBy": ["espn", "nflverse"]}
        for i in range(n)
    ]


def member(sub, entry="season"):
    return {"SK": f"MEMBER#{sub}", "sub": sub, "entryType": entry}


def sheet(sub, picks, tiebreak=40, complete=True):
    return {"SK": f"PICK#{sub}", "sub": sub, "picks": picks, "tiebreak": tiebreak, "complete": complete}


def pick_home(confs, right):
    """Picks over games g00.. with these confidences; right for the confs in `right`."""
    return {f"g{i:02d}": {"team": f"H{i}" if c in right else f"A{i}", "conf": c} for i, c in enumerate(confs)}


def subset(values, target):
    if target == 0:
        return set()
    for i, v in enumerate(values):
        if v <= target:
            rest = subset(values[i + 1:], target - v)
            if rest is not None:
                return {v} | rest
    return None


def grade(items, members, n=3, versions=(), replay=False, played=None):
    return results.week_result(9, played or games(n), items, members, list(versions), f"g{n - 1:02d}", replay)


def test_week9_sheet_through_the_pipeline():
    """Synthesize sheets that score each submitter's real Week 9 weekly and yearly numbers, then
    check the pipeline's missed rows and places against Dom's sheet."""
    weekly = {r["member"]: r["points"] for r in SHEET["weekly_w9"]}
    yearly = {r["member"]: r["weeks"][8] for r in SHEET["yearly_through_w9"]}
    n = 16
    members = [member(m, "season" if m in yearly else "weekly") for m in weekly]
    items = [{"SK": "GOW", "gameId": "g00"}]
    for m, points in weekly.items():
        if points == 79:  # the six non-submitters (test_sheet_golden.MISSED)
            continue
        # The GOW is g00; its confidence is |yearly - weekly| and it's right when yearly is higher.
        diff = yearly.get(m, points + 1) - points
        gow = abs(diff)
        others = [c for c in range(n, 0, -1) if c != gow]
        right = subset(others, points - gow if diff > 0 else points) | ({gow} if diff > 0 else set())
        items.append(sheet(m, pick_home([gow] + others[::-1], right)))

    out = grade(items, members, n)
    rows = out["members"]
    assert {m: r["weekly"] for m, r in rows.items()} == weekly
    assert {m: rows[m]["yearly"] for m in yearly} == yearly
    assert {m for m, r in rows.items() if r["missed"]} == {m for m, p in weekly.items() if p == 79}
    for r in SHEET["weekly_w9"]:
        assert rows[r["member"]]["place"].rstrip("*") == r["place"].rstrip("*")
    assert out["status"] == results.FINAL


def test_right_wrong_void_and_gow():
    items = [
        {"SK": "GOW", "gameId": "g00"},
        sheet("a", pick_home([3, 2, 1], right={3, 1})),
        sheet("b", pick_home([1, 2, 3], right={2, 3})),
    ]
    out = grade(items, [member("a"), member("b")])
    a, b = out["members"]["a"], out["members"]["b"]
    assert a["games"] == {"g00": "right", "g01": "wrong", "g02": "right"}
    assert (a["weekly"], a["yearly"], a["gow"]) == (4, 7, 3)
    assert (b["weekly"], b["yearly"], b["gow"]) == (5, 4, -1)
    assert (a["place"], b["place"]) == ("2", "1")
    assert out["winners"] == ["b"]
    assert out["teams"]["H0"] == "W" and out["teams"]["A0"] == "L"


def test_canceled_after_lock_voids_without_reranking():
    items = [
        {"SK": "CANCELED", "gameIds": ["g01"]},
        sheet("a", pick_home([3, 2, 1], right={3, 2, 1})),
    ]
    a = grade(items, [member("a")])["members"]["a"]
    assert a["games"]["g01"] == "void"
    assert a["weekly"] == 4  # 3 + 1; the 2 on the canceled game scores 0 and nothing moves up


def test_status_open_provisional_final():
    played = games(3)
    played[2] = {**played[2], "completed": False}
    assert grade([], [member("a")], played=played)["status"] == results.OPEN
    played[2] = {**played[2], "completed": True, "confirmedBy": ["espn"]}
    out = grade([], [member("a")], played=played)
    assert out["status"] == results.PROVISIONAL
    assert grade([], [member("a")], played=played, replay=True)["status"] == results.FINAL


def test_open_week_has_no_payout_winner():
    played = games(3)
    played[2] = {**played[2], "completed": False}
    out = grade([sheet("a", pick_home([3, 2, 1], right={3, 2, 1}))], [member("a")], played=played)
    assert out["winners"] == [] and out["tiebreakTotal"] is None
    assert out["members"]["a"]["games"]["g02"] == "pending"


def test_override_beats_the_feed_and_confirms():
    played = games(3)
    played[0] = {**played[0], "confirmedBy": ["espn"]}
    items = [
        {"SK": "OVERRIDE#g00", "awayScore": 17, "homeScore": 17},
        sheet("a", pick_home([3, 2, 1], right={2, 1})),
    ]
    out = grade(items, [member("a")], played=played)
    assert out["games"]["g00"]["result"] == TIE
    assert out["status"] == results.FINAL
    assert out["members"]["a"]["games"]["g00"] == "tie"
    assert out["teams"]["A0"] == "T"


def test_tied_game_scores_per_rules_version():
    played = games(3)
    played[0] = {**played[0], "awayScore": 20, "homeScore": 20}
    items = [sheet("a", pick_home([3, 2, 1], right=set()))]
    assert grade(items, [member("a")], played=played)["members"]["a"]["weekly"] == 0
    full = [{"version": 1, "effectiveWeek": 9, "pickemTie": "full"}]
    out = grade(items, [member("a")], played=played, versions=full)
    assert out["members"]["a"]["weekly"] == 3 and out["rulesVersion"] == 1


def test_incomplete_sheet_is_a_missed_week():
    items = [
        sheet("a", pick_home([3, 2, 1], right={3})),
        sheet("b", pick_home([3, 2, 1], right={3, 2, 1}), tiebreak=None, complete=False),
    ]
    b = grade(items, [member("a"), member("b")])["members"]["b"]
    assert b["missed"] and b["weekly"] == 2


def test_hash_tracks_inputs_only():
    items = [sheet("a", pick_home([3, 2, 1], right={3}))]
    one = grade(items, [member("a")])["inputHash"]
    assert grade(items, [member("a")])["inputHash"] == one
    assert grade(items, [member("a", "weekly")])["inputHash"] != one
    assert grade(items + [{"SK": "GOW", "gameId": "g01"}], [member("a")])["inputHash"] != one


# Regrade against the tables.

LOCK = "2027-09-10T00:20:00Z"


@pytest.fixture
def db(app, monkeypatch):
    from lambdas.common import events

    monkeypatch.setenv("OPS_TABLE", "ops")
    create_table("ops")
    monkeypatch.setattr(events, "dynamodb", boto3.resource("dynamodb"))

    seed_week(2027, 1, LOCK, [("100", "A0", "H0", 1), ("101", "A1", "H1", 2)])
    t = table()
    t.put_item(Item={"PK": "GROUP#g", "SK": "META", "groupId": "g", "season": 2027, "replay": False, "clock": "2027-09-12T00:00:00Z"})
    for sub in ("a", "b"):
        t.put_item(Item={"PK": "GROUP#g", "SK": f"MEMBER#{sub}", **member(sub)})
    pk = "GROUP#g#S2027#W01"
    t.put_item(Item={"PK": pk, "SK": "GOW", "gameId": "100"})
    t.put_item(Item={"PK": pk, **sheet("a", {"100": {"team": "H0", "conf": 2}, "101": {"team": "H1", "conf": 1}}, 30)})
    t.put_item(Item={"PK": pk, **sheet("b", {"100": {"team": "A0", "conf": 1}, "101": {"team": "H1", "conf": 2}}, 40)})
    return t


def finish(gid, away, home, confirmed=True):
    from lambdas.common import nfl_store

    nfl_store.save_game(2027, 1, {
        "gameId": gid, "completed": True, "awayScore": away, "homeScore": home,
        "confirmedBy": ["espn", "nflverse"] if confirmed else ["espn"],
    })


def stored(t):
    return t.get_item(Key={"PK": "GROUP#g#S2027#W01", "SK": "RESULT"})["Item"]


def emitted():
    return boto3.resource("dynamodb").Table("ops").query(KeyConditionExpression=Key("PK").eq("EVENTS"))["Items"]


def group(t):
    return t.get_item(Key={"PK": "GROUP#g", "SK": "META"})["Item"]


def test_regrade_writes_once_and_announces_when_final(db):
    finish("100", 10, 20, confirmed=False)
    finish("101", 14, 21)
    assert results.regrade(db, group(db)) == [1]
    assert stored(db)["status"] == "provisional"
    assert emitted() == []
    assert results.regrade(db, group(db)) == []

    finish("100", 10, 20)
    assert results.regrade(db, group(db)) == [1]
    result = stored(db)
    assert result["status"] == "final"
    assert {m: r["weekly"] for m, r in result["members"].items()} == {"a": 3, "b": 2}
    assert result["winners"] == ["a"] and result["tiebreakTotal"] == 35
    [event] = emitted()
    assert (event["type"], event["eventId"], event["payload"]) == ("week_confirmed", "result#W01", {"winners": ["a"]})


def test_correction_that_flips_the_winner_announces_v2(db):
    finish("100", 10, 20)
    finish("101", 14, 21)
    results.regrade(db, group(db))
    db.put_item(Item={"PK": "GROUP#g#S2027#W01", "SK": "OVERRIDE#100", "awayScore": 24, "homeScore": 20})
    assert results.regrade(db, group(db), [1]) == [1]
    assert stored(db)["winners"] == ["b"]
    assert [e["eventId"] for e in emitted()] == ["result#W01", "result#W01#v2"]


def test_unlocked_weeks_are_skipped(db):
    db.update_item(Key={"PK": "GROUP#g", "SK": "META"}, UpdateExpression="SET clock = :c", ExpressionAttributeValues={":c": "2027-09-01T00:00:00Z"})
    assert results.regrade(db, group(db), [1]) == []
