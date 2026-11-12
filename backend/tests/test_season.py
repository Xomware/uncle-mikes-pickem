from boto3.dynamodb.conditions import Key

from lambdas.common import results, season
from tests.test_results import db, emitted, finish, group, member  # noqa: F401  (db is a fixture)
from tests.test_sheet_golden import GRID, outcomes_from_grid

SEASON_PK = "GROUP#g#S2027"


def standings(t):
    return t.get_item(Key={"PK": SEASON_PK, "SK": "STANDINGS"})["Item"]


def entries(t):
    items = t.query(KeyConditionExpression=Key("PK").eq(SEASON_PK) & Key("SK").begins_with("DEATH#"))["Items"]
    return {i["entryId"]: i for i in items}


def add_entry(t, entry_id, picks):
    t.put_item(Item={
        "PK": SEASON_PK, "SK": f"DEATH#{entry_id}", "entryId": entry_id, "ownerSub": "a",
        "label": entry_id.upper(), "picks": picks,
    })


def test_standings_hold_season_members_only(db):
    db.put_item(Item={"PK": "GROUP#g", "SK": "MEMBER#w", **member("w", "weekly"), "name": "W"})
    finish("100", 10, 20)
    finish("101", 14, 21)
    out = results.regrade(db, group(db))
    assert out["standings"] is True
    table = standings(db)
    assert (table["throughWeek"], table["final"]) == (1, True)
    # a: H0 right at 2 (the GOW, doubled) + H1 at 1 = 5. b: A0 wrong at 1 (GOW, -1) + H1 at 2 = 1.
    assert [(r["member"], r["name"], r["total"], r["gow"], r["place"], r["weeks"]) for r in table["rows"]] == [
        ("a", "A", 5, 2, "1", {"1": 5}),
        ("b", "B", 1, -1, "2", {"1": 1}),
    ]
    assert results.regrade(db, group(db))["standings"] is False


def test_loss_and_missed_pick_eliminate_once_final(db):
    add_entry(db, "x", {"1": "A0"})  # loses
    add_entry(db, "y", {})  # no pick
    add_entry(db, "z", {"1": "H1"})  # wins
    finish("100", 10, 20, confirmed=False)
    finish("101", 14, 21)
    assert results.regrade(db, group(db))["eliminated"] == []
    assert all("eliminatedWeek" not in e for e in entries(db).values())

    finish("100", 10, 20)
    assert sorted(results.regrade(db, group(db))["eliminated"]) == ["x", "y"]
    stored = entries(db)
    assert {e: (s["livesLeft"], s.get("eliminatedWeek")) for e, s in stored.items()} == {
        "x": (0, 1), "y": (0, 1), "z": (1, None),
    }
    assert sorted(e["eventId"] for e in emitted() if e["type"] == "entry_eliminated") == [
        "death#W01#x", "death#W01#y",
    ]
    assert results.regrade(db, group(db))["eliminated"] == []


def test_second_life_spends_a_life_without_eliminating(db):
    db.put_item(Item={"PK": "GROUP#g", "SK": "RULES#S2027#v1", "version": 1, "effectiveWeek": 1, "deathSecondLife": True})
    add_entry(db, "x", {"1": "A0"})
    add_entry(db, "z", {"1": "H1"})
    finish("100", 10, 20)
    finish("101", 14, 21)
    results.regrade(db, group(db))
    x = entries(db)["x"]
    assert x["livesLeft"] == 1 and "eliminatedWeek" not in x


def test_death_grid_golden_through_the_table(db):
    teams = {}
    for (week, team), (outcome,) in outcomes_from_grid().items():
        teams.setdefault(week, {})[team] = outcome
    for e in GRID:
        add_entry(db, e["entry"], {str(w): t for w, t in enumerate(e["picks"], 1)})
    found = [{"week": w, "status": "final", "teams": teams[w]} for w in sorted(teams)]
    out = season.fold_death(db, "g", 2027, found, [])
    stored = entries(db)
    for e in GRID:
        assert stored[e["entry"]].get("eliminatedWeek") == (len(e["picks"]) if e["eliminated"] else None)
    assert sorted(out) == sorted(e["entry"] for e in GRID if e["eliminated"])

    # A provisional week stops the fold there: nothing past it counts.
    found[1]["status"] = "provisional"
    season.fold_death(db, "g", 2027, found, [])
    assert {e for e, s in entries(db).items() if s.get("eliminatedWeek")} == {
        e["entry"] for e in GRID if e["eliminated"] and len(e["picks"]) == 1
    }
