"""GET /stats/global: app-wide stats for the latest season (common/app_stats.py).

As on /standings/global, a group is named only to its members, and nobody gets groupIds.
"""

import os

import boto3
from boto3.dynamodb.conditions import Key

from lambdas.common import app_stats, nfl_store
from lambdas.common.api import api_handler, respond, user

dynamodb = boto3.resource("dynamodb")


@api_handler("stats_global")
def handler(event, context):
    me = user(event)
    table = dynamodb.Table(os.environ["APP_TABLE"])
    latest = table.query(KeyConditionExpression=Key("PK").eq(app_stats.PK), ScanIndexForward=False, Limit=1)["Items"]
    if not latest:
        return respond(200, None)
    found = {k: v for k, v in nfl_store.plain(latest[0]).items() if k not in ("PK", "SK")}
    mine = table.query(IndexName="GSI1", KeyConditionExpression=Key("GSI1PK").eq(f"USER#{me['sub']}"))["Items"]
    names = {m["GSI1SK"].removeprefix("GROUP#"): m["groupName"] for m in mine}
    groups = [{**{k: v for k, v in g.items() if k != "groupId"}, "name": names.get(g["groupId"])} for g in found["groups"]]
    return respond(200, {**found, "groups": groups})
