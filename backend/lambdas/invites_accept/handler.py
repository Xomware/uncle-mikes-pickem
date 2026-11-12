"""POST /invites/accept {code, entryType?}: join the invite's group as a member. Accepting twice is a no-op."""

import os
from datetime import datetime, timezone
from typing import Annotated

import boto3
from pydantic import StringConstraints

from lambdas.common.api import ApiError, Request, api_handler, parse_body, respond, user
from lambdas.common.groups import EntryType, group_summary, member_item

dynamodb = boto3.resource("dynamodb")


class AcceptInvite(Request):
    code: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=64)]
    entryType: EntryType = "season"


@api_handler("invites_accept")
def handler(event, context):
    me = user(event)
    body = parse_body(event, AcceptInvite)
    table = dynamodb.Table(os.environ["APP_TABLE"])

    invite = table.get_item(Key={"PK": f"INVITE#{body.code}", "SK": "META"}).get("Item")
    if not invite:
        raise ApiError(404, "That invite link isn't valid. Ask your organizer for a new one.")
    if invite["expiresAt"] <= datetime.now(timezone.utc).isoformat():
        raise ApiError(410, "That invite link has expired. Ask your organizer for a new one.")

    group = table.get_item(Key={"PK": f"GROUP#{invite['groupId']}", "SK": "META"})["Item"]
    member = member_item(group, me["sub"], me["name"], "member", body.entryType)
    # Never overwrite an existing member: that would reset their role and joinedWeek.
    try:
        table.put_item(Item=member, ConditionExpression="attribute_not_exists(SK)")
    except table.meta.client.exceptions.ConditionalCheckFailedException:
        existing = table.get_item(Key={"PK": member["PK"], "SK": member["SK"]})["Item"]
        return respond(200, {**group_summary(existing), "joined": False})
    return respond(201, {**group_summary(member), "joined": True})
