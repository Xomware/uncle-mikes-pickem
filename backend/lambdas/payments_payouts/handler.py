"""GET /payments/payouts?id=g: each week's winners and pot, the season pot projected and final, the death pool,
and each winner's total won vs sent. Every member sees all of it. Amounts are cents (common/payouts.py)."""

import os

import boto3
from boto3.dynamodb.conditions import Key

from lambdas.common import flags, payouts
from lambdas.common.api import ApiError, api_handler, query_param, respond, user

dynamodb = boto3.resource("dynamodb")


@api_handler("payments_payouts")
def handler(event, context):
    me = user(event)
    gid = query_param(event, "id")
    flags.require("payouts", gid)
    table = dynamodb.Table(os.environ["APP_TABLE"])
    items = table.query(KeyConditionExpression=Key("PK").eq(f"GROUP#{gid}"))["Items"]
    meta = next((i for i in items if i["SK"] == "META"), None)
    members = [i for i in items if i["SK"].startswith("MEMBER#")]
    mine = next((m for m in members if m["sub"] == me["sub"]), None)
    if not meta or not mine:
        raise ApiError(404, "Group not found")
    versions = [i for i in items if i["SK"].startswith(f"RULES#S{int(meta['season'])}#")]
    book = payouts.load(table, gid, meta, members, versions)
    return respond(
        200,
        {"group": {"groupId": gid, "name": meta["name"], "season": int(meta["season"])}, "role": mine["role"], **book},
    )
