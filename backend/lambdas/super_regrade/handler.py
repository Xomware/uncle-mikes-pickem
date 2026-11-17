"""POST /super/regrade {groupId, week?}: regrade any group, one week or every locked week. Super admin only, audited.

The same in-process regrade as results_regrade, without its organizer check.
"""

import os
from typing import Annotated

import boto3
from pydantic import Field, StringConstraints

from lambdas.common import results, superadmin
from lambdas.common.api import ApiError, Request, api_handler, parse_body, respond

dynamodb = boto3.resource("dynamodb")


class Regrade(Request):
    groupId: Annotated[str, StringConstraints(min_length=1, max_length=64)]
    week: Annotated[int, Field(ge=1, le=18)] | None = None


@api_handler("super_regrade")
def handler(event, context):
    who = superadmin.require(event)
    body = parse_body(event, Regrade)
    table = dynamodb.Table(os.environ["APP_TABLE"])
    group = table.get_item(Key={"PK": f"GROUP#{body.groupId}", "SK": "META"}).get("Item")
    if not group:
        raise ApiError(404, "Group not found")
    done = results.regrade(table, group, None if body.week is None else [body.week])
    superadmin.audit(who, "regrade", f"{body.groupId}#W{body.week or 'all'}", None, done)
    return respond(200, done)
