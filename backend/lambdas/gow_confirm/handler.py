"""POST /gow/confirm {t}: choose the game a GOW email button names. Public: the signed token is the credential.

The token works once, until the week locks, and only while its admin is still
an organizer. It sets the GOW as POST /gow/set does, with chosenBy the admin.
"""

import os
from datetime import timedelta
from typing import Annotated

import boto3
from botocore.exceptions import ClientError
from pydantic import StringConstraints

from lambdas.common import gow, gow_link, nfl_store, weeks
from lambdas.common.api import ApiError, Request, api_handler, parse_body, respond
from lambdas.common.groups import ORGANIZERS

# Past the latest lock a token can carry; after that the used marker has nothing to guard.
USED_TTL = timedelta(days=30)

dynamodb = boto3.resource("dynamodb")


class Confirm(Request):
    t: Annotated[str, StringConstraints(min_length=1, max_length=512)]


@api_handler("gow_confirm")
def handler(event, context):
    token = parse_body(event, Confirm).t
    table = dynamodb.Table(os.environ["APP_TABLE"])
    link, group, feed, nfl_week = gow_link.resolve(table, token)
    if gow_link.closed(link, feed, nfl_week):
        raise ApiError(409, f"Week {link.week} has locked, so its GOW can't change")
    admin = table.get_item(Key={"PK": f"GROUP#{link.group_id}", "SK": f"MEMBER#{link.admin_sub}"}).get("Item")
    if not admin or admin["role"] not in ORGANIZERS:
        raise ApiError(403, "This link's owner is no longer an organizer of the group")
    pk = weeks.week_pk(link.group_id, link.season, link.week)
    if link.game_id in weeks.canceled_ids(table, pk):
        raise ApiError(409, "That game is canceled for this group")

    now = nfl_store.iso(feed.now)
    try:
        dynamodb.Table(os.environ["OPS_TABLE"]).put_item(
            Item={**gow_link.used_key(link, token), "at": now, "ttl": int((feed.now + USED_TTL).timestamp())},
            ConditionExpression="attribute_not_exists(PK)",
        )
    except ClientError as e:
        if e.response["Error"]["Code"] != "ConditionalCheckFailedException":
            raise
        raise ApiError(409, "This link was already used. Choose again from the picks page.")
    item = gow.item(pk, link.game_id, link.admin_sub, now)
    table.put_item(Item=item)
    return respond(200, {"gow": gow.public(item), "groupId": link.group_id, "week": link.week})
