"""GET /results/week?groupId=g&week=n: the week's graded RESULT for the results grid. Members only.

A RESULT exists only once the week has locked and been graded; before that this is a 404.
"""

import os

import boto3
from boto3.dynamodb.conditions import Key

from lambdas.common import nfl_store, weeks
from lambdas.common.api import ApiError, api_handler, query_param, respond, user

dynamodb = boto3.resource("dynamodb")

FIELDS = (
    "week", "status", "gradedAt", "rulesVersion", "gowGameId", "tiebreakGameId", "tiebreakTotal",
    "canceled", "games", "winners",
)


@api_handler("results_week")
def handler(event, context):
    me = user(event)
    gid = query_param(event, "groupId")
    week = query_param(event, "week")
    if not week.isdigit() or not 1 <= int(week) <= 18:
        raise ApiError(400, "week must be 1 to 18")
    table = dynamodb.Table(os.environ["APP_TABLE"])
    items = table.query(KeyConditionExpression=Key("PK").eq(f"GROUP#{gid}"))["Items"]
    meta = next((i for i in items if i["SK"] == "META"), None)
    members = {i["sub"]: i for i in items if i["SK"].startswith("MEMBER#")}
    if not meta or me["sub"] not in members:
        raise ApiError(404, "Group not found")

    key = {"PK": weeks.week_pk(gid, int(meta["season"]), int(week)), "SK": "RESULT"}
    result = table.get_item(Key=key).get("Item")
    if not result:
        raise ApiError(404, f"Week {week} hasn't been graded yet")
    result = nfl_store.plain(result)
    rows = [
        {"sub": sub, "name": members[sub]["name"], "entryType": members[sub]["entryType"], **row}
        for sub, row in result["members"].items()
        if sub in members
    ]
    rows.sort(key=lambda r: (-r["weekly"], r["name"].lower()))
    return respond(200, {"groupId": gid, "season": int(meta["season"]), **{k: result[k] for k in FIELDS}, "members": rows})
