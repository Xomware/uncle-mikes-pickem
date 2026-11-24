from lambdas.common import app_stats
from tests.conftest import DOM, PAT, call, table
from tests.test_cron_regrade import group, result  # noqa: F401  (group is a fixture)
from tests.test_cron_tick import board, serve, tick  # noqa: F401
from tests.test_finals import final_board, nflverse_says


def outcome(winner, away, home):
    return {"result": winner, "awayScore": away, "homeScore": home}


def row(games, weekly, missed=False):
    return {"games": games, "weekly": weekly, "missed": missed}


def sheet(picks):
    return {"picks": {gid: {"team": team, "conf": conf} for gid, (team, conf) in picks.items()}}


# Week 1: NYJ beat BUF in an upset, KC beat LV. Week 2: DAL and PHI tie.
GAMES = {1: {"g1": outcome("NYJ", 20, 17), "g2": outcome("KC", 10, 31)}, 2: {"g3": outcome("tie", 24, 24)}}


def week(n, members):
    return {"week": n, "members": members, "games": GAMES[n], "winners": []}


def inputs():
    # Pool A: a and b both take BUF over NYJ; a and b take KC. c missed the week.
    a1 = [
        week(1, {"a": row({"g1": "wrong", "g2": "right"}, 2), "b": row({"g1": "wrong", "g2": "right"}, 1), "c": row({}, 0, True)}),
        week(2, {"a": row({"g3": "tie"}, 0), "b": row({"g3": "tie"}, 0), "c": row({}, 0, True)}),
    ]
    a1_sheets = {
        1: {"a": sheet({"g1": ("BUF", 1), "g2": ("KC", 2)}), "b": sheet({"g1": ("BUF", 2), "g2": ("KC", 1)})},
        2: {"a": sheet({"g3": ("DAL", 1)}), "b": sheet({"g3": ("PHI", 1)})},
    }
    # Pool B: d alone takes NYJ (right) and LV (wrong); its g2 game is still pending for e.
    b1 = [week(1, {"d": row({"g1": "right", "g2": "wrong"}, 2), "e": row({"g1": "wrong", "g2": "pending"}, 0)})]
    b1_sheets = {1: {"d": sheet({"g1": ("NYJ", 2), "g2": ("LV", 1)}), "e": sheet({"g1": ("BUF", 1), "g2": ("KC", 2)})}}
    return [("A", a1, a1_sheets), ("B", b1, b1_sheets)]


def test_accuracy_counts_decided_picks_only():
    out = app_stats.build(inputs(), 2026)
    assert (out["season"], out["week"], out["players"]) == (2026, 2, 4)
    assert out["accuracy"] == {"correct": 3, "wrong": 4, "ties": 2}
    assert out["weeks"] == [
        {"week": 1, "correct": 3, "wrong": 4, "ties": 0, "sheets": 4},
        {"week": 2, "correct": 0, "wrong": 0, "ties": 2, "sheets": 2},
    ]


def test_groups_rank_on_average_points_per_sheet():
    # A: 3 points over 4 sheets. B: 2 over 2.
    out = app_stats.build(inputs(), 2026)
    assert [(g["groupId"], g["rank"], g["players"], g["sheets"], g["points"]) for g in out["groups"]] == [
        ("B", 1, 2, 2, 2),
        ("A", 2, 2, 4, 3),
    ]


def test_equal_averages_share_a_rank():
    found = [week(1, {"a": row({}, 4)})]
    other = [week(1, {"b": row({}, 2), "c": row({}, 6)})]
    out = app_stats.build([("A", found, {}), ("B", other, {})], 2026)
    assert [(g["groupId"], g["rank"]) for g in out["groups"]] == [("B", 1), ("A", 1)]


def test_team_totals_and_most_picked_first():
    rows = app_stats.build(inputs(), 2026)["teams"]
    teams = {t["team"]: t for t in rows}
    assert [t["team"] for t in rows][:2] == ["BUF", "KC"]
    assert teams["BUF"] == {"team": "BUF", "picks": 3, "correct": 0, "wrong": 3, "ties": 0, "points": 0}
    assert teams["KC"] == {"team": "KC", "picks": 2, "correct": 2, "wrong": 0, "ties": 0, "points": 3}
    assert teams["NYJ"]["points"] == 2 and teams["LV"]["wrong"] == 1
    assert teams["DAL"]["ties"] == 1


def test_upsets_are_games_most_of_the_field_lost():
    # g1: 3 of 4 took BUF. g2: 1 of 3 took LV, so no upset. g3 tied.
    [upset] = app_stats.build(inputs(), 2026)["upsets"]
    assert upset == {
        "week": 1, "gameId": "g1", "winner": "NYJ", "loser": "BUF",
        "winnerScore": 20, "loserScore": 17, "picks": 4, "onLoser": 3,
    }


def test_a_regrade_tick_writes_the_stats(tick, store, group, monkeypatch):  # noqa: F811
    serve(monkeypatch, tick, [final_board(), board(11)])
    nflverse_says(monkeypatch, tick, 17, 20)
    tick.handler({"force": True}, None)

    item = group.get_item(Key={"PK": "STATS", "SK": "S2026"})["Item"]
    marks = list(result(group)["members"]["a"]["games"].values())
    assert item["week"] == 10
    assert (item["accuracy"]["correct"], item["accuracy"]["wrong"]) == (marks.count("right"), marks.count("wrong"))
    assert sum(t["picks"] for t in item["teams"]) == marks.count("right") + marks.count("wrong") + marks.count("tie")
    assert [g["groupId"] for g in item["groups"]] == ["g"]


def test_global_stats_name_only_your_groups(app):
    db = table()
    db.put_item(Item={"PK": "GROUP#g1", "SK": f"MEMBER#{DOM['sub']}", "GSI1PK": f"USER#{DOM['sub']}", "GSI1SK": "GROUP#g1", "groupName": "Dom's Pool"})
    db.put_item(Item={"PK": "STATS", "SK": "S2025", "season": 2025, "groups": []})
    groups = [
        {"groupId": "g2", "rank": 1, "players": 3, "sheets": 9, "points": 90},
        {"groupId": "g1", "rank": 2, "players": 2, "sheets": 6, "points": 30},
    ]
    db.put_item(Item={"PK": "STATS", "SK": "S2026", "season": 2026, "week": 3, "groups": groups, "teams": []})

    status, data = call(app("stats_global"), DOM)
    assert status == 200
    assert data["season"] == 2026 and "PK" not in data
    assert [(g["rank"], g["name"]) for g in data["groups"]] == [(1, None), (2, "Dom's Pool")]
    assert not any("groupId" in g for g in data["groups"])
    assert call(app("stats_global"), PAT)[1]["groups"][1]["name"] is None


def test_global_stats_before_any_are_built(app):
    assert call(app("stats_global"), DOM) == (200, None)
