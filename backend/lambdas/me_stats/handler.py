"""GET /me/stats?id=g: the caller's season in one group (common/stats.py), their season place and
what they've won. Members only. money is null while payouts are turned off for the group."""

import os

import boto3
from boto3.dynamodb.conditions import Key

from lambdas.common import flags, nfl_store, payouts, season as season_fold, stats
from lambdas.common.api import ApiError, api_handler, query_param, respond, user
from lambdas.common.ledger import season_pk
from lambdas.common.weeks import week_pk

dynamodb = boto3.resource("dynamodb")


@api_handler("me_stats")
def handler(event, context):
    me = user(event)
    gid = query_param(event, "id")
    table = dynamodb.Table(os.environ["APP_TABLE"])
    items = nfl_store.plain(table.query(KeyConditionExpression=Key("PK").eq(f"GROUP#{gid}"))["Items"])
    meta = next((i for i in items if i["SK"] == "META"), None)
    members = [i for i in items if i["SK"].startswith("MEMBER#")]
    mine = next((m for m in members if m["sub"] == me["sub"]), None)
    if not meta or not mine:
        raise ApiError(404, "Group not found")

    season = int(meta["season"])
    feed = nfl_store.for_group(meta)
    last = feed.last_locked_week() or 0
    results = season_fold.week_results(table, gid, season, last)
    sheets, kickoffs = {}, {}
    for r in results:
        if r["members"].get(me["sub"], {}).get("games"):
            key = {"PK": week_pk(gid, season, r["week"]), "SK": f"PICK#{me['sub']}"}
            sheets[r["week"]] = nfl_store.plain(table.get_item(Key=key)["Item"])
            kickoffs |= {g["gameId"]: g["kickoff"] for g in feed.games(r["week"])}

    held = nfl_store.plain(table.query(KeyConditionExpression=Key("PK").eq(season_pk(gid, season)))["Items"])
    standings = next((i for i in held if i["SK"] == "STANDINGS"), None)
    row = next((r for r in (standings or {}).get("rows", []) if r["member"] == me["sub"]), None)
    money = None
    if flags.enabled("payouts", gid):
        versions = [i for i in items if i["SK"].startswith(f"RULES#S{season}#")]
        entries = [i for i in held if i["SK"].startswith("DEATH#")]
        marks = [i for i in held if i["SK"].startswith("PAYOUT#")]
        book = payouts.build(members, versions, last, results, standings, entries, marks)
        totals = next((t for t in book["members"] if t["sub"] == me["sub"]), {"won": 0, "pending": 0})
        money = {"won": totals["won"], "pending": totals["pending"]}

    return respond(
        200,
        {
            "group": {"groupId": gid, "name": meta["name"], "season": season},
            "entryType": mine["entryType"],
            "throughWeek": last,
            "season": {k: row[k] for k in ("place", "total", "gow")} if row else None,
            "money": money,
            **stats.member_stats(me["sub"], results, sheets, kickoffs),
        },
    )
