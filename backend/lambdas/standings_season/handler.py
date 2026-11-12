"""GET /standings/season?id=g: the season table (yearly total, GOW tiebreak, places). Members only.

Season members only: weekly-only members play for the weekly pot and aren't on it.
Before any week is graded the table is empty.
"""

import os

import boto3
from boto3.dynamodb.conditions import Key

from lambdas.common import nfl_store
from lambdas.common.api import ApiError, api_handler, query_param, respond, user
from lambdas.common.death import entries_pk

dynamodb = boto3.resource("dynamodb")


@api_handler("standings_season")
def handler(event, context):
    me = user(event)
    gid = query_param(event, "id")
    table = dynamodb.Table(os.environ["APP_TABLE"])
    items = table.query(KeyConditionExpression=Key("PK").eq(f"GROUP#{gid}"))["Items"]
    meta = next((i for i in items if i["SK"] == "META"), None)
    if not meta or not any(i["SK"] == f"MEMBER#{me['sub']}" for i in items):
        raise ApiError(404, "Group not found")

    season = int(meta["season"])
    stored = table.get_item(Key={"PK": entries_pk(gid, season), "SK": "STANDINGS"}).get("Item")
    found = nfl_store.plain(stored) if stored else {"throughWeek": 0, "final": False, "rows": []}
    return respond(200, {"groupId": gid, "season": season, **{k: found[k] for k in ("throughWeek", "final", "rows")}})
