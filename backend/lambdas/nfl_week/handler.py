"""GET /nfl/week[?week=n]: the live season's slate for one week, with the caller's picks in each group.

No group needed: games come straight from the live SEASON rows, the week ESPN calls
current by default. A week before cron_tick went live has no rows, so it comes from the
replay rows' nflverse finals instead (`archived`: no picks, no game info). Picks are the caller's own, so nothing another member hid until
lock is shown. Records are each team's going into the week, folded from nflverse and
cached on pickem-nfl as `SEASON#yr#Wnn / RECORDS`; once every earlier game is final
they never change, so the row is kept for good.
"""

import os
import urllib.error
from collections import Counter
from datetime import timedelta

import boto3
from boto3.dynamodb.conditions import Key

from lambdas.common import clock, gow, nfl_store, nflverse, weeks
from lambdas.common.api import ApiError, api_handler, respond, user
from lambdas.common.game_view import GAME_FIELDS

dynamodb = boto3.resource("dynamodb")

LAST_WEEK = 18
RECORDS_FOR = timedelta(minutes=30)


def week_param(event: dict, current: int) -> int:
    raw = (event.get("queryStringParameters") or {}).get("week")
    if not raw:
        return current
    if not raw.isdigit() or not 1 <= int(raw) <= LAST_WEEK:
        raise ApiError(400, "week must be 1 to 18")
    return int(raw)


def scheduled_weeks(season: int, current: int) -> list[int]:
    """Weeks with a WEEK row, plus the archived weeks before the current one."""
    name = os.environ["NFL_TABLE"]
    keys = [{"PK": nfl_store.week_pk(season, w), "SK": "WEEK"} for w in range(1, LAST_WEEK + 1)]
    resp = dynamodb.batch_get_item(RequestItems={name: {"Keys": keys, "ProjectionExpression": "PK"}})
    if resp.get("UnprocessedKeys"):
        raise RuntimeError("BatchGetItem left WEEK keys unprocessed")
    live = {int(i["PK"].rsplit("W", 1)[1]) for i in resp["Responses"][name]}
    return sorted(live | {w for w in nfl_store.replay_lock_ats(season) if w < current})


def fold_records(text: str, season: int, week: int) -> tuple[dict[str, str], bool]:
    """({abbr: "W-L" or "W-L-T"} entering `week`, whether every earlier game is final)."""
    wins, losses, ties = Counter(), Counter(), Counter()
    complete = True
    for g in nflverse.games(text, season).values():
        if g["gameType"] != "REG" or g["week"] >= week:
            continue
        if not g["final"]:
            complete = False
        elif g["tie"]:
            ties.update([g["away"], g["home"]])
        else:
            wins[g["winner"]] += 1
            losses[g["home"] if g["winner"] == g["away"] else g["away"]] += 1
    teams = set(wins) | set(losses) | set(ties)
    return {t: f"{wins[t]}-{losses[t]}" + (f"-{ties[t]}" if ties[t] else "") for t in teams}, complete


def records(season: int, week: int) -> dict[str, str]:
    key = {"PK": nfl_store.week_pk(season, week), "SK": "RECORDS"}
    now = clock.now()
    hit = nfl_store.table().get_item(Key=key).get("Item")
    if hit and (hit["complete"] or now - nfl_store.parse(hit["builtAt"]) < RECORDS_FOR):
        return hit["records"]
    try:
        text = nflverse.fetch()
    except (urllib.error.URLError, TimeoutError):
        # Records are a garnish on the slate: GitHub being down shouldn't take the games with it.
        return hit["records"] if hit else {}
    built, complete = fold_records(text, season, week)
    nfl_store.table().put_item(Item={**key, "records": built, "complete": complete, "builtAt": nfl_store.iso(now)})
    return built


def game(g: dict, week: int, recs: dict[str, str]) -> dict:
    return {
        **{k: g.get(k) for k in GAME_FIELDS},
        "week": week,
        "away": {**g["away"], "record": recs.get(g["away"]["abbr"])},
        "home": {**g["home"], "record": recs.get(g["home"]["abbr"])},
        "lines": g.get("lines"),
        "broadcasts": g.get("broadcasts") or [],
        "hype": (g.get("hype") or {}).get("score"),
    }


def pick_week(season: int, current: int) -> int | None:
    """The first stored week that hasn't locked. ESPN keeps a week current until midweek,
    after its Thursday lock, while cron_tick already holds the next one open for picks."""
    now = clock.now()
    for w in (current, current + 1):
        row = nfl_store.get_week(season, w)
        if row and nfl_store.parse(row["lockAt"]) > now:
            return w
    return None


def my_picks(sub: str, season: int, week: int) -> list[dict]:
    """The caller's sheet in each of their groups for this season, in one BatchGetItem."""
    table = dynamodb.Table(os.environ["APP_TABLE"])
    members = table.query(IndexName="GSI1", KeyConditionExpression=Key("GSI1PK").eq(f"USER#{sub}"))["Items"]
    roles = {m["GSI1SK"].removeprefix("GROUP#"): m["role"] for m in members if int(m["season"]) == season}
    gids = sorted(roles)
    if not gids:
        return []
    name = os.environ["APP_TABLE"]
    keys = [{"PK": f"GROUP#{g}", "SK": "META"} for g in gids]
    keys += [{"PK": weeks.week_pk(g, season, week), "SK": f"PICK#{sub}"} for g in gids]
    keys += [{"PK": weeks.week_pk(g, season, week), "SK": "GOW"} for g in gids]
    resp = dynamodb.batch_get_item(RequestItems={name: {"Keys": keys}})
    if resp.get("UnprocessedKeys"):
        raise RuntimeError("BatchGetItem left group keys unprocessed")
    items = {(i["PK"], i["SK"]): nfl_store.plain(i) for i in resp["Responses"][name]}
    out = []
    for gid in gids:
        meta = items[(f"GROUP#{gid}", "META")]
        pick = items.get((weeks.week_pk(gid, season, week), f"PICK#{sub}"))
        chosen = items.get((weeks.week_pk(gid, season, week), "GOW"))
        out.append({
            "groupId": gid,
            "name": meta["name"],
            # A replay group's sheet was made on its virtual clock, against the same games.
            "replay": bool(meta.get("replay")),
            "picks": pick["picks"] if pick else None,
            "complete": bool(pick and pick["complete"]),
            "role": roles[gid],
            "gow": {"gameId": chosen["gameId"], "chosenBy": chosen["chosenBy"]} if chosen else None,
        })
    return sorted(out, key=lambda g: (g["replay"], g["name"].lower()))


@api_handler("nfl_week")
def handler(event, context):
    me = user(event)
    current = nfl_store.current_week()
    if not current:
        raise ApiError(404, "The NFL schedule isn't loaded yet")
    season, current_week = current
    week = week_param(event, current_week)
    archived = not nfl_store.get_week(season, week) and week < current_week
    games = nfl_store.archive_games(season, week) if archived else nfl_store.list_games(season, week)
    if not games:
        raise ApiError(404, f"Week {week} isn't on the schedule yet")
    recs = records(season, week)
    row = None if archived else nfl_store.get_week(season, week)
    return respond(
        200,
        {
            "season": season,
            "week": week,
            "currentWeek": current_week,
            "pickWeek": pick_week(season, current_week),
            "weeks": scheduled_weeks(season, current_week),
            "archived": archived,
            "lockAt": row["lockAt"] if row else None,
            # After this, cron_tick sets the GOW for any live group that hasn't.
            "gowDeadline": nfl_store.iso(gow.deadline(row["lockAt"])) if row else None,
            "games": [game(g, week, recs) for g in games],
            "groups": [] if archived else my_picks(me["sub"], season, week),
        },
    )
