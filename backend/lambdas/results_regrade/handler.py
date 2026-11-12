"""POST /results/regrade {groupId, week?}: regrade one week, or every locked week, then refold the season. Organizer.

Idempotent: a week whose inputs haven't changed isn't rewritten.
"""

import os
from typing import Annotated

import boto3
from pydantic import Field, StringConstraints

from lambdas.common import results
from lambdas.common.api import Request, api_handler, parse_body, respond, user
from lambdas.common.groups import membership, require_organizer

dynamodb = boto3.resource("dynamodb")


class Regrade(Request):
    groupId: Annotated[str, StringConstraints(min_length=1, max_length=64)]
    week: Annotated[int, Field(ge=1, le=18)] | None = None


@api_handler("results_regrade")
def handler(event, context):
    me = user(event)
    body = parse_body(event, Regrade)
    table = dynamodb.Table(os.environ["APP_TABLE"])
    require_organizer(membership(table, body.groupId, me["sub"]))
    group = table.get_item(Key={"PK": f"GROUP#{body.groupId}", "SK": "META"})["Item"]
    return respond(200, results.regrade(table, group, None if body.week is None else [body.week]))
