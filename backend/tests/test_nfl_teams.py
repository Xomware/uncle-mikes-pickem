import pytest

from lambdas.common import nfl_store
from tests.conftest import DOM, PAT, SAM, call, table


@pytest.fixture
def teams(app):
    return app("nfl_teams")


def game(gid, away, home, kickoff, score=None, spread=None):
    g = {"gameId": gid, "kickoff": kickoff, "away": {"abbr": away}, "home": {"abbr": home}, "state": "pre", "completed": False}
    if score:
        g.update(state="post", completed=True, awayScore=score[0], homeScore=score[1])
    if spread is not None:
        g["lines"] = {"spread": spread, "overUnder": 47.5}
    return g


# Week 1 and 2 are final, Week 3 is open (CURRENT), so the last locked week is 2.
SEASON = {
    1: [
        game("11", "KC", "LV", "2026-09-13T17:00:00Z", (27, 20), spread=6.5),
        game("12", "BUF", "MIA", "2026-09-13T20:00:00Z", (17, 17)),
    ],
    2: [
        game("21", "DEN", "KC", "2026-09-20T17:00:00Z", (24, 21), spread=-3.0),
        game("22", "LV", "BUF", "2026-09-20T20:00:00Z", (10, 31)),
    ],
    3: [game("31", "MIA", "LV", "2026-09-27T17:00:00Z")],
    4: [game("41", "KC", "BUF", "2026-10-04T17:00:00Z", spread=1.5)],
}


def seed():
    for week, games in SEASON.items():
        for g in games:
            nfl_store.save_game(2026, week, g)
        nfl_store.save_week(2026, week, games[0]["kickoff"], games[-1]["gameId"], [g["gameId"] for g in games], "2000-01-01T00:00:00Z")
    nfl_store.set_current(2026, 3)


def group(gid="g", clock="2026-09-25T12:00:00Z", members=(DOM, PAT, SAM)):
    table().put_item(Item={"PK": f"GROUP#{gid}", "SK": "META", "groupId": gid, "name": "Mikes", "season": 2026, "clock": clock})
    for m in members:
        table().put_item(Item={"PK": f"GROUP#{gid}", "SK": f"MEMBER#{m['sub']}", "sub": m["sub"], "name": m["name"], "role": "member"})


def sheet(week, who, picks, complete=True, gid="g"):
    table().put_item(Item={
        "PK": f"GROUP#{gid}#S2026#W{week:02d}", "SK": f"PICK#{who['sub']}", "sub": who["sub"],
        "picks": {gid_: {"team": team, "conf": conf} for gid_, (team, conf) in picks.items()}, "complete": complete,
    })


def get(module, who=DOM, **query):
    return call(module, who, query=query or None)


def test_every_team_has_a_record_from_the_finals(teams):
    seed()
    status, data = get(teams, season="2026")
    assert status == 200 and data["season"] == 2026 and data["group"] is None and data["team"] is None
    by = {t["abbr"]: t for t in data["teams"]}
    assert len(by) == 32
    kc = by["KC"]
    assert (kc["name"], kc["conference"], kc["division"]) == ("Kansas City Chiefs", "AFC", "West")
    assert kc["overall"] == {"w": 1, "l": 1, "t": 0}
    assert (kc["home"], kc["road"]) == ({"w": 0, "l": 1, "t": 0}, {"w": 1, "l": 0, "t": 0})
    # LV is a division game, DEN too; BUF in Week 4 hasn't been played.
    assert kc["divisionRecord"] == {"w": 1, "l": 1, "t": 0}
    assert (kc["pointsFor"], kc["pointsAgainst"], kc["form"]) == (48, 44, ["W", "L"])
    assert by["BUF"]["overall"] == {"w": 1, "l": 0, "t": 1} and by["BUF"]["divisionRecord"] == {"w": 0, "l": 0, "t": 1}
    assert by["NYG"]["overall"] == {"w": 0, "l": 0, "t": 0} and by["NYG"]["logo"].endswith("/nyg.png")


def test_season_defaults_to_the_current_one(teams):
    seed()
    assert get(teams)[1]["season"] == 2026


def test_team_schedule_with_bye_scores_and_own_line(teams):
    seed()
    status, data = get(teams, team="kc")
    assert status == 200
    rows = data["team"]["schedule"]
    assert [(r["week"], r["bye"]) for r in rows] == [(1, False), (2, False), (3, True), (4, False)]
    w1, w2, _, w4 = rows
    assert (w1["home"], w1["opponent"]["abbr"], w1["result"], w1["score"], w1["opponentScore"]) == (False, "LV", "W", 27, 20)
    # ESPN's spread is the home line: LV +6.5 makes KC -6.5 on the road.
    assert (w1["spread"], w2["spread"], w4["spread"]) == (-6.5, -3.0, -1.5)
    assert (w4["result"], w4["score"], w4["state"]) == (None, None, "pre")
    assert data["team"]["picks"] is None


def test_unknown_team_is_a_400(teams):
    seed()
    assert get(teams, team="XYZ") == (400, "XYZ isn't an NFL team")
    assert get(teams, season="20x6")[0] == 400


def test_group_pick_records_in_locked_weeks(teams):
    seed()
    group()
    # Week 1: KC won. Dom and Sam took KC, Pat took LV.
    sheet(1, DOM, {"11": ("KC", 2), "12": ("BUF", 1)})
    sheet(1, PAT, {"11": ("LV", 2), "12": ("MIA", 1)})
    sheet(1, SAM, {"11": ("KC", 1), "12": ("BUF", 2)})
    # Week 2: KC lost. Dom took KC; Pat's incomplete sheet doesn't count.
    sheet(2, DOM, {"21": ("KC", 2), "22": ("BUF", 1)})
    sheet(2, PAT, {"21": ("DEN", 2), "22": (None, 1)}, complete=False)
    sheet(2, SAM, {"21": ("DEN", 1), "22": ("BUF", 2)})
    # Week 4 isn't locked: its picks stay hidden.
    sheet(4, DOM, {"41": ("KC", 1)})

    status, data = get(teams, team="KC", groupId="g")
    assert status == 200 and data["group"] == {"groupId": "g", "name": "Mikes"}
    picks = data["team"]["picks"]
    assert picks["mine"] == {"for": {"w": 1, "l": 1, "t": 0}, "against": {"w": 0, "l": 0, "t": 0}}
    assert picks["group"] == {"for": {"w": 2, "l": 1, "t": 0}, "against": {"w": 1, "l": 1, "t": 0}}
    rows = {r["week"]: r for r in data["team"]["schedule"]}
    assert rows[1]["picks"] == {"canceled": False, "for": 2, "against": 1, "mine": {"team": "KC", "conf": 2}}
    assert rows[2]["picks"]["for"] == 1 and rows[2]["picks"]["against"] == 1
    assert rows[4]["picks"] is None


def test_overrides_and_canceled_games(teams):
    seed()
    group()
    sheet(1, DOM, {"11": ("LV", 2), "12": ("BUF", 1)})
    sheet(2, DOM, {"21": ("KC", 2), "22": ("BUF", 1)})
    # The organizer's final makes LV the Week 1 winner for this group; Week 2's KC game is voided.
    table().put_item(Item={"PK": "GROUP#g#S2026#W01", "SK": "OVERRIDE#11", "awayScore": 10, "homeScore": 13})
    table().put_item(Item={"PK": "GROUP#g#S2026#W02", "SK": "CANCELED", "gameIds": ["21"]})
    data = get(teams, team="KC", groupId="g")[1]
    assert data["team"]["picks"]["mine"] == {"for": {"w": 0, "l": 0, "t": 0}, "against": {"w": 1, "l": 0, "t": 0}}
    assert data["team"]["schedule"][1]["picks"] == {"canceled": True, "for": 0, "against": 0, "mine": None}


def test_replay_group_sees_its_clock(teams):
    weeks = {w: [{**g, "lines": g.get("lines") or {}} for g in games] for w, games in SEASON.items() if w <= 2}
    for games in weeks.values():
        for g in games:
            g.setdefault("awayScore", None)
            g.setdefault("homeScore", None)
    nfl_store.save_replay(2026, weeks, "2000-01-01T00:00:00Z")
    table().put_item(Item={"PK": "GROUP#r", "SK": "META", "groupId": "r", "name": "Replay", "season": 2026, "replay": True, "clock": "2026-09-15T12:00:00Z"})
    table().put_item(Item={"PK": "GROUP#r", "SK": f"MEMBER#{DOM['sub']}", "sub": DOM["sub"], "name": "Dom", "role": "owner"})
    data = get(teams, team="KC", groupId="r")[1]
    assert data["replay"] is True and data["now"] == "2026-09-15T12:00:00Z"
    # Week 2 kicks off after the clock: KC is 1-0 and Week 2 has no score.
    assert data["team"]["overall"] == {"w": 1, "l": 0, "t": 0}
    assert data["team"]["schedule"][1]["score"] is None


def test_live_weeks_before_launch_come_from_the_replay_finals(teams):
    seed()
    week1 = [{**g, "lines": g.get("lines"), "tie": False, "final": True, "snapshots": []} for g in SEASON[1]]
    nfl_store.save_replay(2026, {1: week1}, "2026-11-12T00:00:00Z")
    pk = nfl_store.week_pk(2026, 1)
    for key in [{"PK": pk, "SK": "WEEK"}] + [{"PK": pk, "SK": f"GAME#{g['gameId']}"} for g in SEASON[1]]:
        nfl_store.table().delete_item(Key=key)
    group()

    data = get(teams, team="KC", groupId="g")[1]
    assert data["team"]["overall"] == {"w": 1, "l": 1, "t": 0}
    w1, w2 = data["team"]["schedule"][:2]
    assert (w1["week"], w1["archived"], w1["result"], w1["score"], w1["opponentScore"]) == (1, True, "W", 27, 20)
    assert w1["picks"] is None and w2["archived"] is False


def test_members_only(teams):
    seed()
    group(members=(DOM,))
    assert get(teams, who=PAT, groupId="g") == (404, "Group not found")
    assert get(teams, groupId="nope") == (404, "Group not found")
