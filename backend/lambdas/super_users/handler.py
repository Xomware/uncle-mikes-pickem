"""GET /super/users: everyone who has signed in, newest activity first, with their groups. Super admin only.

A USER PROFILE is upserted on each sign-in (me_profile), so updatedAt is when they last loaded the site.
"""

from collections import defaultdict

from boto3.dynamodb.conditions import Attr

from lambdas.common import superadmin
from lambdas.common.api import api_handler, respond
from lambdas.common.groups import group_summary


@api_handler("super_users")
def handler(event, context):
    superadmin.require(event)
    rows = superadmin.scan("APP_TABLE", FilterExpression=Attr("SK").eq("PROFILE") | Attr("SK").begins_with("MEMBER#"))
    groups = defaultdict(list)
    for r in rows:
        if r["SK"].startswith("MEMBER#"):
            groups[r["sub"]].append(group_summary(r))
    profiles = sorted((r for r in rows if r["SK"] == "PROFILE"), key=lambda p: p.get("updatedAt", ""), reverse=True)
    return respond(
        200,
        [
            {
                "sub": p["PK"].removeprefix("USER#"),
                "email": p.get("email"),
                "name": p.get("name"),
                "createdAt": p.get("createdAt"),
                "lastSeen": p.get("updatedAt"),
                "groups": groups[p["PK"].removeprefix("USER#")],
            }
            for p in profiles
        ],
    )
