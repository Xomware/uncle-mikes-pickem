"""GET /admin/overview: this week's to-do list for each current-season group the caller owns or admins.

Pending invites aren't listed: INVITE# items are keyed by code, so finding a group's would take a scan.
"""

import os
from datetime import timezone

import boto3
from boto3.dynamodb.conditions import Key

from lambdas.common import flags, gow, ledger, nfl_store
from lambdas.common.api import api_handler, respond, user
from lambdas.common.groups import ORGANIZERS
from lambdas.common.weeks import week_pk

dynamodb = boto3.resource("dynamodb")


def query(table, pk: str) -> list[dict]:
    return table.query(KeyConditionExpression=Key("PK").eq(pk))["Items"]


def gow_view(feed: nfl_store.Feed, week: int, item: dict | None, names: dict) -> dict | None:
    if not item:
        return None
    game = next((g for g in feed.games(week) if g["gameId"] == item["gameId"]), None)
    return {
        "gameId": item["gameId"],
        "matchup": game and f"{game['away']['abbr']} @ {game['home']['abbr']}",
        "chosenBy": names.get(item["chosenBy"], item["chosenBy"]),
    }


def unpaid(table, gid: str, season: int, members: list[dict], versions: list[dict], through: int) -> dict | None:
    """Who has a balance through the last locked week, by the same ledger the payments page shows."""
    if not flags.enabled("payments", gid):
        return None
    rows = query(table, ledger.season_pk(gid, season))
    entries = [r for r in rows if r["SK"].startswith("DEATH#")]
    pays = [r for r in rows if r["SK"].startswith("PAY#")]
    owing = [r for r in ledger.build(members, entries, pays, versions, through)["members"] if r["balance"] > 0]
    return {"count": len(owing), "amount": sum(r["balance"] for r in owing), "names": [r["name"] for r in owing]}


def group_row(table, gid: str, role: str) -> dict:
    items = query(table, f"GROUP#{gid}")
    meta = next(i for i in items if i["SK"] == "META")
    members = sorted((i for i in items if i["SK"].startswith("MEMBER#")), key=lambda m: m["name"].lower())
    names = {m["sub"]: m["name"] for m in members}
    feed = nfl_store.for_group(meta)
    week = (feed.last_locked_week() or 0) + 1
    nfl_week = feed.week(week)
    rows = query(table, week_pk(gid, feed.season, week))
    complete = {r["sub"] for r in rows if r["SK"].startswith("PICK#") and r.get("complete")}
    versions = [i for i in items if i["SK"].startswith(f"RULES#S{feed.season}#")]
    return {
        "groupId": gid,
        "name": meta["name"],
        "season": feed.season,
        "role": role,
        "replay": bool(meta.get("replay")),
        "week": week,
        # None once the season is over or before the schedule is loaded.
        "lockAt": nfl_week and nfl_week["lockAt"],
        "gow": gow_view(feed, week, next((r for r in rows if r["SK"] == "GOW"), None), names),
        "gowDeadline": nfl_week and nfl_store.iso(gow.deadline(nfl_week["lockAt"]).astimezone(timezone.utc)),
        "members": len(members),
        "missing": [m["name"] for m in members if m["sub"] not in complete],
        "unpaid": unpaid(table, gid, feed.season, members, versions, week - 1),
    }


@api_handler("admin_overview")
def handler(event, context):
    me = user(event)
    table = dynamodb.Table(os.environ["APP_TABLE"])
    mine = table.query(IndexName="GSI1", KeyConditionExpression=Key("GSI1PK").eq(f"USER#{me['sub']}"))["Items"]
    current = nfl_store.current_week()
    season = current[0] if current else 0
    groups = [
        group_row(table, m["GSI1SK"].removeprefix("GROUP#"), m["role"])
        for m in mine
        if m["role"] in ORGANIZERS and int(m["season"]) >= season
    ]
    return respond(200, sorted(groups, key=lambda g: g["name"].lower()))
