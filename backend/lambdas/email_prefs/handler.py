"""GET /email/prefs: the caller's email preferences in every group they belong to.

`types` maps each preference to its label, so the profile page has one source
for the wording. `suppressed` means SES reported the address as bouncing or
complaining, and no toggle will reach it.
"""

import os

import boto3
from boto3.dynamodb.conditions import Key

from lambdas.common.api import api_handler, claims, respond, user
from lambdas.common.email_prefs import TYPES, with_defaults
from lambdas.common.suppression import is_suppressed

dynamodb = boto3.resource("dynamodb")


@api_handler("email_prefs")
def handler(event, context):
    me = user(event)
    table = dynamodb.Table(os.environ["APP_TABLE"])
    members = table.query(IndexName="GSI1", KeyConditionExpression=Key("GSI1PK").eq(f"USER#{me['sub']}"))["Items"]
    groups = [
        {
            "groupId": m["GSI1SK"].removeprefix("GROUP#"),
            "name": m["groupName"],
            "season": m["season"],
            "role": m["role"],
            "prefs": with_defaults(m.get("emailPrefs")),
        }
        for m in sorted(members, key=lambda m: (-m["season"], m["groupName"].lower()))
    ]
    address = claims(event)["email"]
    return respond(200, {"address": address, "suppressed": is_suppressed(address), "types": TYPES, "groups": groups})
