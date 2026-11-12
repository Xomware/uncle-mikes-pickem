"""POST /rules/update {groupId, changes}: write the next RULES#S<yr>#v<n>. Owner or admin only.

The version takes effect from the next unlocked week and never rescores earlier ones (common/rules.py).
"""

import os
from datetime import datetime, timezone
from typing import Annotated, Literal

import boto3
from boto3.dynamodb.conditions import Key
from pydantic import Field, StringConstraints, model_validator

from lambdas.common.api import ApiError, Request, api_handler, parse_body, respond, user
from lambdas.common.groups import membership, next_unlocked_week, require_organizer
from lambdas.common.rules import new_version

dynamodb = boto3.resource("dynamodb")

Dollars = Annotated[int, Field(ge=0, le=10_000)]
Split = Annotated[list[Annotated[int, Field(gt=0, le=100)]], Field(min_length=1, max_length=10)]


class Fees(Request):
    weekly: Dollars
    yearly: Dollars
    death: Dollars


class PotSplits(Request):
    weekly: Split
    yearly: Split
    death: Split

    @model_validator(mode="after")
    def each_pot_pays_out_in_full(self):
        for pot in ("weekly", "yearly", "death"):
            if sum(getattr(self, pot)) != 100:
                raise ValueError(f"{pot} split must add up to 100")
        return self


class Payment(Request):
    method: Literal["venmo", "zelle", "cashapp", "paypal", "other"]
    handle: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=80)]


class Changes(Request):
    pickemTie: Literal["zero", "full"] | None = None
    deathTie: Literal["loss", "win"] | None = None
    deathSecondLife: bool | None = None
    fees: Fees | None = None
    potSplits: PotSplits | None = None
    payments: Annotated[list[Payment], Field(max_length=8)] | None = None


class UpdateRules(Request):
    groupId: Annotated[str, StringConstraints(min_length=1, max_length=64)]
    changes: Changes


@api_handler("rules_update")
def handler(event, context):
    me = user(event)
    body = parse_body(event, UpdateRules)
    changes = body.changes.model_dump(exclude_none=True)
    if not changes:
        raise ApiError(400, "No changes")
    table = dynamodb.Table(os.environ["APP_TABLE"])
    require_organizer(membership(table, body.groupId, me["sub"]))

    pk = f"GROUP#{body.groupId}"
    season = int(table.get_item(Key={"PK": pk, "SK": "META"})["Item"]["season"])
    prefix = f"RULES#S{season}#"
    versions = table.query(KeyConditionExpression=Key("PK").eq(pk) & Key("SK").begins_with(prefix))["Items"]
    try:
        version = new_version(versions, changes, next_unlocked_week(season))
    except ValueError as e:
        raise ApiError(409, str(e))

    item = {
        **version,
        "PK": pk,
        "SK": f"{prefix}v{version['version']}",
        "changedBy": me["sub"],
        "changedAt": datetime.now(timezone.utc).isoformat(),
    }
    try:
        table.put_item(Item=item, ConditionExpression="attribute_not_exists(SK)")
    except table.meta.client.exceptions.ConditionalCheckFailedException:
        raise ApiError(409, "Someone else changed the settings just now. Reload and try again.")
    settings = {k: v for k, v in version.items() if k not in ("version", "effectiveWeek")}
    return respond(200, {"rules": settings, "version": version["version"], "effectiveWeek": version["effectiveWeek"]})
