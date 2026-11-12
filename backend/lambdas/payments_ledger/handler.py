"""GET /payments/ledger?id=g: what each member owes and has paid, and the pots. Members see only their own row."""

import os

import boto3
from boto3.dynamodb.conditions import Key

from lambdas.common import ledger
from lambdas.common.api import ApiError, api_handler, query_param, respond, user
from lambdas.common.groups import ORGANIZERS, next_unlocked_week
from lambdas.common.rules import rules_for

dynamodb = boto3.resource("dynamodb")


@api_handler("payments_ledger")
def handler(event, context):
    me = user(event)
    gid = query_param(event, "id")
    table = dynamodb.Table(os.environ["APP_TABLE"])
    items = table.query(KeyConditionExpression=Key("PK").eq(f"GROUP#{gid}"))["Items"]
    meta = next((i for i in items if i["SK"] == "META"), None)
    members = [i for i in items if i["SK"].startswith("MEMBER#")]
    mine = next((m for m in members if m["sub"] == me["sub"]), None)
    if not meta or not mine:
        raise ApiError(404, "Group not found")
    season = int(meta["season"])
    rules = rules_for([i for i in items if i["SK"].startswith(f"RULES#S{season}#")], next_unlocked_week(season))

    pk = ledger.season_pk(gid, season)

    def rows(prefix):
        return table.query(KeyConditionExpression=Key("PK").eq(pk) & Key("SK").begins_with(prefix))["Items"]

    book = ledger.build(sorted(members, key=lambda m: m["name"].lower()), rows("DEATH#"), rows("PAY#"), rules)
    organizer = mine["role"] in ORGANIZERS
    return respond(
        200,
        {
            "group": {"groupId": gid, "name": meta["name"], "season": season},
            "role": mine["role"],
            "fees": rules["fees"],
            "methods": rules["payments"],
            "members": book["members"] if organizer else [r for r in book["members"] if r["sub"] == me["sub"]],
            "pots": book["pots"],
        },
    )
