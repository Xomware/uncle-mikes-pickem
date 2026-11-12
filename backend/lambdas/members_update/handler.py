"""POST /members/update {groupId, sub, entryType?, role?}: change a member's entry type or role.

Owner or admin sets entry types. Only the owner promotes or demotes admins, and the owner's role never changes.
"""

import os
from typing import Annotated, Literal

import boto3
from pydantic import StringConstraints

from lambdas.common.api import ApiError, Request, api_handler, parse_body, respond, user
from lambdas.common.groups import EntryType, membership, require_organizer

dynamodb = boto3.resource("dynamodb")


class UpdateMember(Request):
    groupId: Annotated[str, StringConstraints(min_length=1, max_length=64)]
    sub: Annotated[str, StringConstraints(min_length=1, max_length=128)]
    entryType: EntryType | None = None
    role: Literal["admin", "member"] | None = None


@api_handler("members_update")
def handler(event, context):
    me = user(event)
    body = parse_body(event, UpdateMember)
    changes = body.model_dump(include={"entryType", "role"}, exclude_none=True)
    if not changes:
        raise ApiError(400, "No changes")
    table = dynamodb.Table(os.environ["APP_TABLE"])
    caller = membership(table, body.groupId, me["sub"])
    require_organizer(caller)
    if "role" in changes and caller["role"] != "owner":
        raise ApiError(403, "Only the owner can change roles")

    target = table.get_item(Key={"PK": caller["PK"], "SK": f"MEMBER#{body.sub}"}).get("Item")
    if not target:
        raise ApiError(404, "Member not found")
    if "role" in changes and target["role"] == "owner":
        raise ApiError(409, "The owner's role can't change")

    names = {f"#{k}": k for k in changes}
    values = {f":{k}": v for k, v in changes.items()}
    item = table.update_item(
        Key={"PK": target["PK"], "SK": target["SK"]},
        UpdateExpression="SET " + ", ".join(f"#{k} = :{k}" for k in changes),
        ExpressionAttributeNames=names,
        ExpressionAttributeValues=values,
        ReturnValues="ALL_NEW",
    )["Attributes"]
    return respond(200, {k: item.get(k) for k in ("sub", "name", "role", "entryType", "joinedWeek")})
