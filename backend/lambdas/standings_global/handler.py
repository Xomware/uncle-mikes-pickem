"""GET /standings/global: the leaderboard across every group, season and latest week (common/leaderboard.py).

Each board sends its first PAGE rows plus the caller's own row, wherever it ranks.
A row's group is named only to that group's members; nobody gets groupIds. The sub links to the
player's page (me_stats).
"""

import os

import boto3
from boto3.dynamodb.conditions import Key

from lambdas.common import leaderboard, nfl_store
from lambdas.common.api import api_handler, respond, user

PAGE = 50

dynamodb = boto3.resource("dynamodb")


@api_handler("standings_global")
def handler(event, context):
    me = user(event)
    table = dynamodb.Table(os.environ["APP_TABLE"])
    latest = table.query(KeyConditionExpression=Key("PK").eq(leaderboard.PK), ScanIndexForward=False, Limit=1)["Items"]
    if not latest:
        return respond(200, None)
    found = nfl_store.plain(latest[0])
    groups = table.query(IndexName="GSI1", KeyConditionExpression=Key("GSI1PK").eq(f"USER#{me['sub']}"))["Items"]
    names = {m["GSI1SK"].removeprefix("GROUP#"): m["groupName"] for m in groups}

    def show(row: dict) -> dict:
        shown = {k: v for k, v in row.items() if k != "groupId"}
        return {**shown, "group": names.get(row["groupId"]), "you": row["sub"] == me["sub"]}

    def page(rows: list[dict]) -> dict:
        mine = next((r for r in rows if r["sub"] == me["sub"]), None)
        return {"rows": [show(r) for r in rows[:PAGE]], "me": mine and show(mine), "players": len(rows)}

    return respond(
        200,
        {
            "season": found["season"],
            "week": found["week"],
            "minGraded": found["minGraded"],
            "overall": page(found["overall"]),
            "thisWeek": page(found["thisWeek"]),
        },
    )
