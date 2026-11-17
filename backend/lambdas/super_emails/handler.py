"""GET /super/emails?groupId=: recent mail claims and domain events, newest first, optionally for one group. Super admin only.

A claim (`MAIL#<sub>#<groupId>#<eventId>`, common/mailer.py) is one email attempted: sent, or failed and retryable.
"""

import os

import boto3
from boto3.dynamodb.conditions import Attr, Key

from lambdas.common import superadmin
from lambdas.common.api import api_handler, respond

LIMIT = 200

dynamodb = boto3.resource("dynamodb")


@api_handler("super_emails")
def handler(event, context):
    superadmin.require(event)
    gid = ((event.get("queryStringParameters") or {}).get("groupId") or "").strip()
    claims = []
    for row in superadmin.scan("OPS_TABLE", FilterExpression=Attr("PK").begins_with("MAIL#")):
        # eventId can itself hold '#' (result#W05#v2), so split no further than it.
        _, sub, group_id, event_id = row["PK"].split("#", 3)
        if not gid or group_id == gid:
            claims.append({"sub": sub, "groupId": group_id, "eventId": event_id, "status": row["status"], "at": row["at"]})

    events = dynamodb.Table(os.environ["OPS_TABLE"]).query(
        KeyConditionExpression=Key("PK").eq("EVENTS"), ScanIndexForward=False, Limit=LIMIT
    )["Items"]
    return respond(
        200,
        {
            "claims": sorted(claims, key=lambda c: c["at"], reverse=True)[:LIMIT],
            "events": [
                {"at": e["SK"].split("#")[0], **{k: e[k] for k in ("type", "groupId", "season", "week", "eventId")}}
                for e in events
                if not gid or e["groupId"] == gid
            ],
        },
    )
