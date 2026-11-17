"""GET /super/flags: the flag defaults, the global overrides and each group's overrides. Super admin only.

Overrides are what is stored, not what resolves: a flag missing from a group's map inherits.
"""

from boto3.dynamodb.conditions import Attr

from lambdas.common import flags, superadmin
from lambdas.common.api import api_handler, respond


def known(values: dict) -> dict:
    return {k: v for k, v in values.items() if k in flags.DEFAULTS}


@api_handler("super_flags")
def handler(event, context):
    superadmin.require(event)
    rows = superadmin.scan("APP_TABLE", FilterExpression=superadmin.GROUPS | Attr("SK").eq("FLAGS"))
    stored = {r["PK"]: known(r.get("flags") or {}) for r in rows if r["SK"] == "FLAGS"}
    groups = sorted((r for r in rows if r["SK"] == "META"), key=lambda g: g["name"].lower())
    return respond(
        200,
        {
            "defaults": flags.DEFAULTS,
            "global": stored.get("CONFIG", {}),
            "groups": [{"groupId": g["groupId"], "name": g["name"], "flags": stored.get(g["PK"], {})} for g in groups],
        },
    )
