"""GET /me/stats?id=g[&sub=s]: a player's season in one group (common/stats.py), their season place and
what they've won.

Without `sub` it is the caller's own, in a group they're in. With `sub` it is another player's,
shown to someone who shares the group with them or, when that group is the player's entry on the
global leaderboard, to anyone; `id` may then be left out to take that entry. Someone outside the
group gets no groupId or group name, and the player's short name. Money is only ever the caller's,
and null while payouts are turned off for the group.
"""

import os

import boto3
from boto3.dynamodb.conditions import Key

from lambdas.common import flags, leaderboard, nfl_store, payouts, season as season_fold, stats
from lambdas.common.api import ApiError, api_handler, respond, user
from lambdas.common.ledger import season_pk
from lambdas.common.weeks import week_pk

dynamodb = boto3.resource("dynamodb")


def board_entry(table, sub: str) -> str | None:
    """The groupId of `sub`'s entry on the latest global leaderboard."""
    latest = table.query(KeyConditionExpression=Key("PK").eq(leaderboard.PK), ScanIndexForward=False, Limit=1)["Items"]
    rows = latest[0]["overall"] if latest else []
    return next((r["groupId"] for r in rows if r["sub"] == sub), None)


@api_handler("me_stats")
def handler(event, context):
    me = user(event)
    table = dynamodb.Table(os.environ["APP_TABLE"])
    params = event.get("queryStringParameters") or {}
    sub = params.get("sub") or me["sub"]
    listed = board_entry(table, sub) if sub != me["sub"] else None
    gid = params.get("id") or listed
    if not gid:
        raise ApiError(400, "Missing ?id=")
    items = nfl_store.plain(table.query(KeyConditionExpression=Key("PK").eq(f"GROUP#{gid}"))["Items"])
    meta = next((i for i in items if i["SK"] == "META"), None)
    members = {i["sub"]: i for i in items if i["SK"].startswith("MEMBER#")}
    player = members.get(sub)
    inside = me["sub"] in members
    if not meta or not player or not (inside or gid == listed):
        raise ApiError(404, "Player not found")

    season = int(meta["season"])
    feed = nfl_store.for_group(meta)
    last = feed.last_locked_week() or 0
    results = season_fold.week_results(table, gid, season, last)
    sheets, kickoffs = {}, {}
    for r in results:
        if r["members"].get(sub, {}).get("games"):
            key = {"PK": week_pk(gid, season, r["week"]), "SK": f"PICK#{sub}"}
            sheets[r["week"]] = nfl_store.plain(table.get_item(Key=key)["Item"])
            kickoffs |= {g["gameId"]: g["kickoff"] for g in feed.games(r["week"])}

    held = nfl_store.plain(table.query(KeyConditionExpression=Key("PK").eq(season_pk(gid, season)))["Items"])
    standings = next((i for i in held if i["SK"] == "STANDINGS"), None)
    row = next((r for r in (standings or {}).get("rows", []) if r["member"] == sub), None)
    money = None
    if sub == me["sub"] and flags.enabled("payouts", gid):
        versions = [i for i in items if i["SK"].startswith(f"RULES#S{season}#")]
        entries = [i for i in held if i["SK"].startswith("DEATH#")]
        marks = [i for i in held if i["SK"].startswith("PAYOUT#")]
        book = payouts.build(list(members.values()), versions, last, results, standings, entries, marks)
        totals = next((t for t in book["members"] if t["sub"] == sub), {"won": 0, "pending": 0})
        money = {"won": totals["won"], "pending": totals["pending"]}

    return respond(
        200,
        {
            "player": {"sub": sub, "name": player["name"] if inside else leaderboard.short_name(player["name"])},
            "group": {"groupId": gid, "name": meta["name"], "season": season} if inside else None,
            "you": sub == me["sub"],
            "entryType": player["entryType"],
            "throughWeek": last,
            "season": {k: row[k] for k in ("place", "total", "gow")} if row else None,
            "money": money,
            **stats.member_stats(sub, results, sheets, kickoffs),
        },
    )
