"""POST /payments/payout-mark {groupId, sub, pot, week?, sent, method?, sentOn?}. Owner or admin only.

Records that the organizer sent a winner their payout outside the app. The amount is the payout as computed
now, not taken from the client. Marking unsent keeps the item, with who unmarked it.
"""

import os
from datetime import date, datetime, timezone
from typing import Annotated, Literal

import boto3
from boto3.dynamodb.conditions import Key
from pydantic import Field, StringConstraints, model_validator

from lambdas.common import ledger, payouts
from lambdas.common.api import ApiError, Request, api_handler, parse_body, respond, user
from lambdas.common.groups import require_organizer

dynamodb = boto3.resource("dynamodb")

Id = Annotated[str, StringConstraints(min_length=1, max_length=128)]


class PayoutMark(Request):
    groupId: Id
    sub: Id
    pot: Literal["weekly", "yearly", "death"]
    week: Annotated[int, Field(ge=1, le=18)] | None = None
    sent: bool
    method: Literal["venmo", "zelle", "cashapp", "paypal", "other"] | None = None
    sentOn: date | None = None

    @model_validator(mode="after")
    def consistent(self):
        if (self.pot == "weekly") != (self.week is not None):
            raise ValueError("week goes with pot weekly, and only weekly")
        if self.sent and None in (self.method, self.sentOn):
            raise ValueError("a sent payout needs method and sentOn")
        return self


@api_handler("payments_payout_mark")
def handler(event, context):
    me = user(event)
    body = parse_body(event, PayoutMark)
    table = dynamodb.Table(os.environ["APP_TABLE"])
    items = table.query(KeyConditionExpression=Key("PK").eq(f"GROUP#{body.groupId}"))["Items"]
    meta = next((i for i in items if i["SK"] == "META"), None)
    members = [i for i in items if i["SK"].startswith("MEMBER#")]
    mine = next((m for m in members if m["sub"] == me["sub"]), None)
    if not meta or not mine:
        raise ApiError(404, "Group not found")
    require_organizer(mine)

    season = int(meta["season"])
    versions = [i for i in items if i["SK"].startswith(f"RULES#S{season}#")]
    book = payouts.load(table, body.groupId, meta, members, versions)
    line = next(
        (p for p in book["payouts"] if (p["pot"], p["week"], p["sub"]) == (body.pot, body.week, body.sub)), None
    )
    if body.sent and not (line and line["final"]):
        raise ApiError(409, "No settled payout to mark for that member")

    record = {"pot": body.pot, "sent": body.sent}
    if body.week:
        record["week"] = body.week
    if body.sent:
        record |= {"amount": line["amount"], "method": body.method, "sentOn": body.sentOn.isoformat()}
    table.put_item(
        Item={
            **record,
            "PK": ledger.season_pk(body.groupId, season),
            "SK": payouts.mark_sk(body.sub, body.pot, body.week),
            "sub": body.sub,
            "markedBy": me["sub"],
            "markedAt": datetime.now(timezone.utc).isoformat(),
        }
    )
    return respond(200, {"sub": body.sub, **record})
