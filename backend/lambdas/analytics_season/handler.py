"""GET /analytics/season?id=g: each season member's chance to win the year. Members only.

Weekly-only members aren't on the yearly board, so they aren't here either. Before any
week is graded there are no odds and `members` is empty.
"""

import os

import boto3
from boto3.dynamodb.conditions import Key

from lambdas.common import flags, nfl_store
from lambdas.common.api import ApiError, api_handler, query_param, respond, user
from lambdas.common.death import entries_pk

dynamodb = boto3.resource("dynamodb")


@api_handler("analytics_season")
def handler(event, context):
    me = user(event)
    gid = query_param(event, "id")
    flags.require("analytics", gid)
    table = dynamodb.Table(os.environ["APP_TABLE"])
    items = table.query(KeyConditionExpression=Key("PK").eq(f"GROUP#{gid}"))["Items"]
    meta = next((i for i in items if i["SK"] == "META"), None)
    members = {i["sub"]: i for i in items if i["SK"].startswith("MEMBER#")}
    if not meta or me["sub"] not in members:
        raise ApiError(404, "Group not found")

    season = int(meta["season"])
    stored = table.get_item(Key={"PK": entries_pk(gid, season), "SK": "ANALYTICS"}).get("Item")
    found = nfl_store.plain(stored) if stored else {"throughWeek": 0, "sims": 0, "computedAt": None, "members": {}}
    rows = [{"sub": s, "name": members[s]["name"], **odds} for s, odds in found["members"].items() if s in members]
    rows.sort(key=lambda r: (-r["pWin"], r["name"].lower()))
    fields = ("throughWeek", "sims", "computedAt")
    return respond(200, {"groupId": gid, "season": season, **{k: found[k] for k in fields}, "members": rows})
