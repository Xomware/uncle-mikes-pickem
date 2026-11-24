from lambdas.common import leaderboard
from tests.conftest import DOM, PAT, SAM, call, table
from tests.test_cron_regrade import group, result  # noqa: F401  (group is a fixture)
from tests.test_cron_tick import board, serve, tick  # noqa: F401
from tests.test_finals import final_board, nflverse_says


def row(games, weekly, missed=False):
    return {"games": dict(enumerate(games)), "weekly": weekly, "missed": missed}


def week(n, members, winners=()):
    return {"week": n, "members": members, "winners": list(winners)}


def member(sub, name):
    return {"sub": sub, "name": name}


def test_short_name_is_first_name_and_last_initial():
    assert leaderboard.short_name("Dominick van Giordano") == "Dominick G."
    assert leaderboard.short_name("dom") == "dom"
    assert leaderboard.short_name("  ") == "Player"


def test_best_entry_per_player_and_a_min_graded_floor():
    # a goes 3-1 in g1 and 1-3 in g2: g1 is the entry that counts. b goes 1-0 and stays unranked.
    g1 = [week(1, {"a": row(["right"] * 3 + ["wrong"], 30), "c": row(["right", "right", "wrong", "wrong"], 20)}, ["a"])]
    g2 = [week(1, {"a": row(["right"] + ["wrong"] * 3, 5), "b": row(["right", "pending", "void"], 9)})]
    out = leaderboard.board([("g1", g1, [member("a", "Al Bundy"), member("c", "Cy")]), ("g2", g2, [member("a", "Al Bundy"), member("b", "Bo")])], 2026)

    assert out["minGraded"] == 2
    assert [(r["name"], r["groupId"], r["rank"], r["correct"], r["won"]) for r in out["overall"]] == [
        ("Al B.", "g1", 1, 3, 1),
        ("Cy", "g1", 2, 2, 0),
        ("Bo", "g2", None, 1, 0),
    ]
    assert out["week"] == 1
    assert [r["name"] for r in out["thisWeek"]] == ["Al B.", "Cy", "Bo"]


def test_this_week_ties_share_a_rank_and_missed_sheets_are_left_off():
    found = [
        week(1, {"a": row(["right"], 5)}),
        week(2, {"a": row(["right", "wrong"], 7), "b": row(["wrong", "right"], 7), "c": row([], 0, missed=True)}),
    ]
    out = leaderboard.board([("g", found, [member(s, s.upper()) for s in "abc"])], 2026)
    assert [(r["name"], r["rank"]) for r in out["thisWeek"]] == [("A", 1), ("B", 1)]
    assert {r["name"]: r["correct"] for r in out["overall"]} == {"A": 2, "B": 1}


def test_a_regrade_tick_writes_the_leaderboard(tick, store, group, monkeypatch):  # noqa: F811
    serve(monkeypatch, tick, [final_board(), board(11)])
    nflverse_says(monkeypatch, tick, 17, 20)
    assert tick.handler({"force": True}, None)["leaderboard"] is True

    item = group.get_item(Key={"PK": "LEADERBOARD", "SK": "S2026"})["Item"]
    assert item["week"] == 10
    [a] = item["overall"]
    graded = [g for g in result(group)["members"]["a"]["games"].values() if g in ("right", "wrong")]
    assert (a["name"], a["rank"], a["correct"] + a["wrong"]) == ("A", 1, len(graded))

    # Nothing changed, so the next sweep leaves it alone.
    assert tick.handler({"force": True}, None)["leaderboard"] is False


def seed(rows):
    app = table()
    app.put_item(Item={"PK": "GROUP#g1", "SK": f"MEMBER#{DOM['sub']}", "GSI1PK": f"USER#{DOM['sub']}", "GSI1SK": "GROUP#g1", "groupName": "Dom's Pool"})
    lines = [
        {"sub": sub, "groupId": gid, "name": name, "rank": i + 1, "correct": 10 - i, "wrong": i, "ties": 0, "points": 50, "won": 0}
        for i, (sub, gid, name) in enumerate(rows)
    ]
    app.put_item(Item={"PK": "LEADERBOARD", "SK": "S2025", "season": 2025, "week": 18, "minGraded": 1, "overall": [], "thisWeek": []})
    app.put_item(Item={"PK": "LEADERBOARD", "SK": "S2026", "season": 2026, "week": 11, "minGraded": 5, "overall": lines, "thisWeek": lines[:1]})


def test_global_names_only_your_own_groups(app):
    seed([(PAT["sub"], "g1", "Pat"), (SAM["sub"], "g2", "Sam"), (DOM["sub"], "g1", "Dom")])
    status, data = call(app("standings_global"), DOM)
    assert status == 200
    assert (data["season"], data["week"], data["minGraded"]) == (2026, 11, 5)
    assert [(r["name"], r["group"], r["you"]) for r in data["overall"]["rows"]] == [
        ("Pat", "Dom's Pool", False),
        ("Sam", None, False),
        ("Dom", "Dom's Pool", True),
    ]
    assert "groupId" not in data["overall"]["rows"][0] and data["overall"]["rows"][0]["sub"] == PAT["sub"]
    assert data["thisWeek"]["me"] is None and data["thisWeek"]["players"] == 1


def test_global_sends_your_row_past_the_first_page(app, monkeypatch):
    handler = app("standings_global")
    monkeypatch.setattr(handler, "PAGE", 2)
    seed([(PAT["sub"], "g2", "Pat"), (SAM["sub"], "g2", "Sam"), (DOM["sub"], "g1", "Dom")])
    data = call(handler, DOM)[1]["overall"]
    assert [r["name"] for r in data["rows"]] == ["Pat", "Sam"]
    assert (data["me"]["name"], data["me"]["rank"], data["players"]) == ("Dom", 3, 3)


def test_global_before_any_board_is_built(app):
    assert call(app("standings_global"), DOM) == (200, None)

