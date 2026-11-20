"""GET /nfl/teams[?team=KC][&groupId=g][&season=2026]: every team's record, and one team's season.

Records come from the GAME items' final scores. With ?groupId= the season and clock are
the group's (a replay group sees only what its clock has reached), and ?team= adds how the
group and the caller have picked that team in locked weeks. Without it, the live season:
?season=, else the one ESPN calls current.
"""

import os

import boto3
from boto3.dynamodb.conditions import Key

from lambdas.common import clock, grade, nfl_store, results
from lambdas.common.api import ApiError, api_handler, query_param, respond, user
from lambdas.common.groups import membership
from lambdas.common.weeks import week_pk

dynamodb = boto3.resource("dynamodb")

WEEKS = range(1, 19)

# abbr (ESPN's): name, conference, division.
TEAMS = {
    "BUF": ("Buffalo Bills", "AFC", "East"),
    "MIA": ("Miami Dolphins", "AFC", "East"),
    "NE": ("New England Patriots", "AFC", "East"),
    "NYJ": ("New York Jets", "AFC", "East"),
    "BAL": ("Baltimore Ravens", "AFC", "North"),
    "CIN": ("Cincinnati Bengals", "AFC", "North"),
    "CLE": ("Cleveland Browns", "AFC", "North"),
    "PIT": ("Pittsburgh Steelers", "AFC", "North"),
    "HOU": ("Houston Texans", "AFC", "South"),
    "IND": ("Indianapolis Colts", "AFC", "South"),
    "JAX": ("Jacksonville Jaguars", "AFC", "South"),
    "TEN": ("Tennessee Titans", "AFC", "South"),
    "DEN": ("Denver Broncos", "AFC", "West"),
    "KC": ("Kansas City Chiefs", "AFC", "West"),
    "LV": ("Las Vegas Raiders", "AFC", "West"),
    "LAC": ("Los Angeles Chargers", "AFC", "West"),
    "DAL": ("Dallas Cowboys", "NFC", "East"),
    "NYG": ("New York Giants", "NFC", "East"),
    "PHI": ("Philadelphia Eagles", "NFC", "East"),
    "WSH": ("Washington Commanders", "NFC", "East"),
    "CHI": ("Chicago Bears", "NFC", "North"),
    "DET": ("Detroit Lions", "NFC", "North"),
    "GB": ("Green Bay Packers", "NFC", "North"),
    "MIN": ("Minnesota Vikings", "NFC", "North"),
    "ATL": ("Atlanta Falcons", "NFC", "South"),
    "CAR": ("Carolina Panthers", "NFC", "South"),
    "NO": ("New Orleans Saints", "NFC", "South"),
    "TB": ("Tampa Bay Buccaneers", "NFC", "South"),
    "ARI": ("Arizona Cardinals", "NFC", "West"),
    "LAR": ("Los Angeles Rams", "NFC", "West"),
    "SF": ("San Francisco 49ers", "NFC", "West"),
    "SEA": ("Seattle Seahawks", "NFC", "West"),
}


def record() -> dict:
    return {"w": 0, "l": 0, "t": 0}


def tally(rec: dict, result: str) -> None:
    rec[result.lower()] += 1


def team_result(game: dict, abbr: str) -> str | None:
    """W, L or T for `abbr` once the game is final."""
    if not game.get("completed") or game.get("awayScore") is None:
        return None
    mine, theirs = ("awayScore", "homeScore") if game["away"]["abbr"] == abbr else ("homeScore", "awayScore")
    return "T" if game[mine] == game[theirs] else "W" if game[mine] > game[theirs] else "L"


def standings(games: list[dict]) -> dict[str, dict]:
    rows = {
        abbr: {
            "abbr": abbr, "name": name, "conference": conf, "division": div, "logo": nfl_store.logo_url(abbr),
            "color": None, "alternateColor": None, "overall": record(), "home": record(), "road": record(),
            "divisionRecord": record(), "pointsFor": 0, "pointsAgainst": 0, "form": [],
        }
        for abbr, (name, conf, div) in TEAMS.items()
    }
    for g in games:
        for side, other in (("away", "home"), ("home", "away")):
            row = rows.get(g[side]["abbr"])
            if not row:
                continue
            row["logo"] = g[side].get("logo") or row["logo"]
            row["color"] = g[side].get("color") or row["color"]
            row["alternateColor"] = g[side].get("alternateColor") or row["alternateColor"]
            result = team_result(g, row["abbr"])
            if not result:
                continue
            tally(row["overall"], result)
            tally(row[side if side == "home" else "road"], result)
            if TEAMS.get(g[other]["abbr"], ())[1:] == (row["conference"], row["division"]):
                tally(row["divisionRecord"], result)
            row["pointsFor"] += g[f"{side}Score"]
            row["pointsAgainst"] += g[f"{other}Score"]
            row["form"].append(result)
    for row in rows.values():
        row["form"] = row["form"][-5:]
    return rows


def team_line(game: dict, home: bool) -> float | None:
    """The team's own spread: ESPN's is the home line."""
    spread = (game.get("lines") or {}).get("spread")
    if spread is None:
        return None
    return spread if home else -spread


def schedule(by_week: dict[int, list[dict]], abbr: str) -> list[dict]:
    rows = []
    for week, games in by_week.items():
        game = next((g for g in games if abbr in (g["away"]["abbr"], g["home"]["abbr"])), None)
        if not game:
            # A week with no rows at all (a live season's weeks before launch) isn't a bye.
            if games:
                rows.append({"week": week, "bye": True})
            continue
        home = game["home"]["abbr"] == abbr
        us, them = ("home", "away") if home else ("away", "home")
        rows.append({
            "week": week, "bye": False, "gameId": game["gameId"], "kickoff": game["kickoff"],
            "timeValid": game.get("timeValid", True), "home": home, "neutralSite": bool(game.get("neutralSite")),
            "opponent": game[them], "state": game.get("state"), "result": team_result(game, abbr),
            "score": game.get(f"{us}Score"), "opponentScore": game.get(f"{them}Score"),
            "spread": team_line(game, home), "overUnder": (game.get("lines") or {}).get("overUnder"),
            "broadcasts": game.get("broadcasts") or [], "picks": None,
        })
    return rows


def pick_records(table, gid: str, feed: nfl_store.Feed, by_week: dict[int, list[dict]], rows: list[dict], abbr: str, me: str) -> dict:
    """Every complete sheet's pick on this team's games in locked weeks, graded the way RESULT grades them.

    A record is the pickers' own: picking KC in a KC loss is an L, picking against them a W.
    """
    totals = {"group": {"for": record(), "against": record()}, "mine": {"for": record(), "against": record()}}
    last = feed.last_locked_week() or 0
    for row in rows:
        if row["bye"] or row["week"] > last:
            continue
        items = nfl_store.plain(table.query(KeyConditionExpression=Key("PK").eq(week_pk(gid, feed.season, row["week"])))["Items"])
        canceled = next((set(i["gameIds"]) for i in items if i["SK"] == "CANCELED"), set())
        if row["gameId"] in canceled:
            row["picks"] = {"canceled": True, "for": 0, "against": 0, "mine": None}
            continue
        game = next(g for g in by_week[row["week"]] if g["gameId"] == row["gameId"])
        override = next((i for i in items if i["SK"] == f"OVERRIDE#{row['gameId']}"), None)
        outcome = results.outcome(game, override, feed.replay)
        split = {"canceled": False, "for": 0, "against": 0, "mine": None}
        for sheet in (i for i in items if i["SK"].startswith("PICK#") and i.get("complete")):
            pick = sheet["picks"].get(row["gameId"])
            if not pick or not pick["team"]:
                continue
            side = "for" if pick["team"] == abbr else "against"
            split[side] += 1
            if sheet["sub"] == me:
                split["mine"] = pick
            if not outcome:
                continue
            result = "T" if outcome["result"] == grade.TIE else "W" if outcome["result"] == pick["team"] else "L"
            tally(totals["group"][side], result)
            if sheet["sub"] == me:
                tally(totals["mine"][side], result)
        row["picks"] = split
    return totals


def season_for(event: dict) -> int:
    raw = (event.get("queryStringParameters") or {}).get("season")
    if raw:
        if not raw.isdigit():
            raise ApiError(400, "season must be a year")
        return int(raw)
    current = nfl_store.current_week()
    if current:
        return current[0]
    now = clock.now()
    return now.year if now.month >= 3 else now.year - 1


@api_handler("nfl_teams")
def handler(event, context):
    me = user(event)
    params = event.get("queryStringParameters") or {}
    abbr = (params.get("team") or "").strip().upper()
    if abbr and abbr not in TEAMS:
        raise ApiError(400, f"{abbr} isn't an NFL team")

    group = None
    if params.get("groupId"):
        gid = query_param(event, "groupId")
        table = dynamodb.Table(os.environ["APP_TABLE"])
        membership(table, gid, me["sub"])
        group = table.get_item(Key={"PK": f"GROUP#{gid}", "SK": "META"})["Item"]
        feed = nfl_store.for_group(group)
    else:
        feed = nfl_store.Feed(season_for(event), False, clock.now())

    by_week = {w: feed.games(w) for w in WEEKS}
    teams = standings([g for games in by_week.values() for g in games])
    body = {
        "season": feed.season,
        "replay": feed.replay,
        "now": nfl_store.iso(feed.now),
        "group": group and {"groupId": group["groupId"], "name": group["name"]},
        "teams": list(teams.values()),
        "team": None,
    }
    if abbr:
        rows = schedule(by_week, abbr)
        picks = group and pick_records(table, group["groupId"], feed, by_week, rows, abbr, me["sub"])
        body["team"] = {**teams[abbr], "schedule": rows, "picks": picks}
    return respond(200, body)
