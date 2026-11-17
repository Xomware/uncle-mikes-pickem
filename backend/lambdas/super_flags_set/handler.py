"""POST /super/flags-set {scope: "global" | groupId, flags: {name: value | null}}: change stored flags. Super admin only.

null removes the override, so a group goes back to inheriting the global value. Audited.
"""

import os
from typing import Annotated

import boto3
from pydantic import StringConstraints

from lambdas.common import flags, superadmin
from lambdas.common.api import ApiError, Request, api_handler, parse_body, respond

BANNER_MAX = 280

dynamodb = boto3.resource("dynamodb")


class SetFlags(Request):
    scope: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=64)]
    flags: dict[str, bool | str | None]


def check(name: str, value) -> None:
    if name not in flags.DEFAULTS:
        raise ApiError(400, f"Unknown flag {name}")
    if value is None:
        return
    if type(value) is not type(flags.DEFAULTS[name]):
        raise ApiError(400, f"{name} takes a {type(flags.DEFAULTS[name]).__name__}")
    if isinstance(value, str) and len(value) > BANNER_MAX:
        raise ApiError(400, f"{name} is at most {BANNER_MAX} characters")


@api_handler("super_flags_set")
def handler(event, context):
    who = superadmin.require(event)
    body = parse_body(event, SetFlags)
    for name, value in body.flags.items():
        check(name, value)
    table = dynamodb.Table(os.environ["APP_TABLE"])
    group_id = None if body.scope == "global" else body.scope
    if group_id and "Item" not in table.get_item(Key={"PK": f"GROUP#{group_id}", "SK": "META"}):
        raise ApiError(404, "Group not found")

    key = flags.key(group_id)
    before = (table.get_item(Key=key).get("Item") or {}).get("flags") or {}
    after = {**before, **body.flags}
    after = {k: v.strip() if isinstance(v, str) else v for k, v in after.items() if v is not None}
    table.put_item(Item={**key, "flags": after})
    superadmin.audit(who, "flags-set", body.scope, before, after)
    return respond(200, {"scope": body.scope, "flags": after})
