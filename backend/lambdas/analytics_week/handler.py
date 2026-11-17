"""GET /analytics/week?groupId=g&week=n: each member's chance to win the week and the rooting guide. Members only.

ANALYTICS is written by the regrade, which never touches an unlocked week, so before
lock this is a 404 and no pick can leak through the odds.
"""

import os

import boto3
from boto3.dynamodb.conditions import Key

from lambdas.common import flags, nfl_store, weeks
from lambdas.common.api import ApiError, api_handler, query_param, respond, user

dynamodb = boto3.resource("dynamodb")


@api_handler("analytics_week")
def handler(event, context):
    me = user(event)
    gid = query_param(event, "groupId")
    flags.require("analytics", gid)
    week = query_param(event, "week")
    if not week.isdigit() or not 1 <= int(week) <= 18:
        raise ApiError(400, "week must be 1 to 18")
    table = dynamodb.Table(os.environ["APP_TABLE"])
    items = table.query(KeyConditionExpression=Key("PK").eq(f"GROUP#{gid}"))["Items"]
    meta = next((i for i in items if i["SK"] == "META"), None)
    members = {i["sub"]: i for i in items if i["SK"].startswith("MEMBER#")}
    if not meta or me["sub"] not in members:
        raise ApiError(404, "Group not found")

    key = {"PK": weeks.week_pk(gid, int(meta["season"]), int(week)), "SK": "ANALYTICS"}
    found = table.get_item(Key=key).get("Item")
    if not found:
        raise ApiError(404, f"Week {week} has no odds yet")
    found = nfl_store.plain(found)
    # A member without a graded sheet can't win the week, so isn't in the sims.
    rows = [
        {"sub": sub, "name": m["name"], **found["members"].get(sub, {"pWin": 0, "root": {}})}
        for sub, m in members.items()
    ]
    rows.sort(key=lambda r: (-r["pWin"], r["name"].lower()))
    fields = ("week", "status", "sims", "computedAt", "games")
    return respond(200, {"groupId": gid, "season": int(meta["season"]), **{k: found[k] for k in fields}, "members": rows})
