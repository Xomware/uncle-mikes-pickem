"""POST /payments/mark {groupId, sub, kind, entryId?, paid, amount?, method?, paidOn?}. Owner or admin only.

Records a payment the organizer received outside the app. Marking unpaid keeps the item, with who unmarked it.
"""

import os
from datetime import date, datetime, timezone
from typing import Annotated, Literal

import boto3
from pydantic import Field, StringConstraints, model_validator

from lambdas.common import ledger
from lambdas.common.api import ApiError, Request, api_handler, parse_body, respond, user
from lambdas.common.groups import membership, require_organizer

dynamodb = boto3.resource("dynamodb")

Id = Annotated[str, StringConstraints(min_length=1, max_length=128)]


class Mark(Request):
    groupId: Id
    sub: Id
    kind: Literal["weekly", "yearly", "death"]
    entryId: Id | None = None
    paid: bool
    amount: Annotated[int, Field(ge=0, le=10_000)] | None = None
    method: Literal["venmo", "zelle", "cashapp", "paypal", "other"] | None = None
    paidOn: date | None = None

    @model_validator(mode="after")
    def consistent(self):
        if (self.kind == "death") != (self.entryId is not None):
            raise ValueError("entryId goes with kind death, and only death")
        if self.paid and None in (self.amount, self.method, self.paidOn):
            raise ValueError("a payment needs amount, method and paidOn")
        return self


@api_handler("payments_mark")
def handler(event, context):
    me = user(event)
    body = parse_body(event, Mark)
    table = dynamodb.Table(os.environ["APP_TABLE"])
    require_organizer(membership(table, body.groupId, me["sub"]))

    target = table.get_item(Key={"PK": f"GROUP#{body.groupId}", "SK": f"MEMBER#{body.sub}"}).get("Item")
    if not target:
        raise ApiError(404, "Member not found")
    if body.kind == "yearly" and target["entryType"] != "season":
        raise ApiError(409, "Weekly-only members don't owe the yearly fee")
    season = int(table.get_item(Key={"PK": f"GROUP#{body.groupId}", "SK": "META"})["Item"]["season"])
    pk = ledger.season_pk(body.groupId, season)
    if body.entryId:
        entry = table.get_item(Key={"PK": pk, "SK": f"DEATH#{body.entryId}"}).get("Item")
        if not entry or entry.get("ownerSub") != body.sub:
            raise ApiError(404, "Death pool entry not found")

    record = {"kind": body.kind, "paid": body.paid}
    if body.entryId:
        record["entryId"] = body.entryId
    if body.paid:
        record |= {"amount": body.amount, "method": body.method, "paidOn": body.paidOn.isoformat()}
    table.put_item(
        Item={
            **record,
            "PK": pk,
            "SK": ledger.pay_sk(body.sub, body.kind, body.entryId),
            "sub": body.sub,
            "markedBy": me["sub"],
            "markedAt": datetime.now(timezone.utc).isoformat(),
        }
    )
    return respond(200, {"sub": body.sub, **record})
