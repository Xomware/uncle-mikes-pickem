"""GET /super/groups: every group with its owner and member count. Super admin only."""

from collections import defaultdict

from boto3.dynamodb.conditions import Attr

from lambdas.common import superadmin
from lambdas.common.api import api_handler, respond


@api_handler("super_groups")
def handler(event, context):
    superadmin.require(event)
    rows = superadmin.scan("APP_TABLE", FilterExpression=superadmin.GROUPS | Attr("SK").begins_with("MEMBER#"))
    members = defaultdict(list)
    for r in rows:
        if r["SK"].startswith("MEMBER#"):
            members[r["PK"]].append(r)
    groups = sorted((r for r in rows if r["SK"] == "META"), key=lambda g: g.get("createdAt", ""), reverse=True)
    return respond(
        200,
        [
            {
                "groupId": g["groupId"],
                "name": g["name"],
                "season": g["season"],
                "replay": bool(g.get("replay")),
                "createdAt": g.get("createdAt"),
                "owner": next((m["name"] for m in members[g["PK"]] if m["sub"] == g["ownerSub"]), None),
                "members": len(members[g["PK"]]),
            }
            for g in groups
        ],
    )
