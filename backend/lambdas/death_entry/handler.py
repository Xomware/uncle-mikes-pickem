"""POST /death/entry {groupId, label?, sub?}: add a death pool entry. Organizers can add one for another member.

Each entry is paid for separately. Entries close at the Week 1 lock, since a later one has already missed a pick.
"""

import os
import secrets
from datetime import datetime, timezone
from typing import Annotated

import boto3
from boto3.dynamodb.conditions import Attr, Key
from pydantic import StringConstraints

from lambdas.common import clock, nfl_store
from lambdas.common.api import ApiError, Request, api_handler, parse_body, respond, user
from lambdas.common.death import entries_pk
from lambdas.common.groups import membership, require_organizer

dynamodb = boto3.resource("dynamodb")


class AddEntry(Request):
    groupId: Annotated[str, StringConstraints(min_length=1, max_length=64)]
    label: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=40)] | None = None
    sub: Annotated[str, StringConstraints(min_length=1, max_length=128)] | None = None


@api_handler("death_entry")
def handler(event, context):
    me = user(event)
    body = parse_body(event, AddEntry)
    table = dynamodb.Table(os.environ["APP_TABLE"])
    caller = membership(table, body.groupId, me["sub"])
    owner = caller
    if body.sub and body.sub != me["sub"]:
        require_organizer(caller)
        owner = table.get_item(Key={"PK": caller["PK"], "SK": f"MEMBER#{body.sub}"}).get("Item")
        if not owner:
            raise ApiError(404, "Member not found")

    group = table.get_item(Key={"PK": caller["PK"], "SK": "META"})["Item"]
    season = int(group["season"])
    week1 = nfl_store.get_week(season, 1)
    if week1 and week1["lockAt"] <= nfl_store.iso(clock.now(group)):
        raise ApiError(409, "Death pool entries closed at the Week 1 lock")

    pk = entries_pk(body.groupId, season)
    owned = table.query(
        KeyConditionExpression=Key("PK").eq(pk) & Key("SK").begins_with("DEATH#"),
        FilterExpression=Attr("ownerSub").eq(owner["sub"]),
        Select="COUNT",
    )["Count"]
    entry_id = secrets.token_hex(4)
    item = {
        "PK": pk,
        "SK": f"DEATH#{entry_id}",
        "entryId": entry_id,
        "ownerSub": owner["sub"],
        "label": body.label or f"{owner['name']} {owned + 1}",
        "picks": {},
        "createdBy": me["sub"],
        "createdAt": datetime.now(timezone.utc).isoformat(),
    }
    table.put_item(Item=item, ConditionExpression="attribute_not_exists(SK)")
    return respond(201, {k: item[k] for k in ("entryId", "ownerSub", "label", "picks")})
