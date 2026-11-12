"""POST /death/pick {groupId, entryId, week, team}: set one entry's team for a week. The entry's owner only.

Rejected at or after the week's lock (the pick-em lock), for a team the entry already used this
season, and for an eliminated entry. Changing a week's pick before its lock is fine.
"""

import os
from typing import Annotated

import boto3
from pydantic import Field, StringConstraints

from lambdas.common import nfl_store
from lambdas.common.api import ApiError, Request, api_handler, parse_body, respond, user
from lambdas.common.death import LAST_WEEK, check_pick, entries_pk
from lambdas.common.groups import membership

dynamodb = boto3.resource("dynamodb")


class SetPick(Request):
    groupId: Annotated[str, StringConstraints(min_length=1, max_length=64)]
    entryId: Annotated[str, StringConstraints(min_length=1, max_length=32)]
    week: Annotated[int, Field(ge=1, le=LAST_WEEK)]
    team: Annotated[str, StringConstraints(strip_whitespace=True, to_upper=True, min_length=2, max_length=4)]


@api_handler("death_pick")
def handler(event, context):
    me = user(event)
    body = parse_body(event, SetPick)
    table = dynamodb.Table(os.environ["APP_TABLE"])
    caller = membership(table, body.groupId, me["sub"])
    group = table.get_item(Key={"PK": caller["PK"], "SK": "META"})["Item"]
    season = int(group["season"])

    key = {"PK": entries_pk(body.groupId, season), "SK": f"DEATH#{body.entryId}"}
    entry = table.get_item(Key=key).get("Item")
    if not entry or entry["ownerSub"] != me["sub"]:
        raise ApiError(404, "Entry not found")
    if entry.get("eliminatedWeek"):
        raise ApiError(409, f"{entry['label']} was eliminated in Week {entry['eliminatedWeek']}")

    feed = nfl_store.for_group(group)
    week = feed.week(body.week)
    if not week:
        raise ApiError(404, f"Week {body.week} isn't on the schedule yet")
    if feed.locked(week):
        raise ApiError(409, f"Week {body.week} is locked")
    teams = {g[side]["abbr"] for g in feed.games(body.week) for side in ("away", "home")}
    if body.team not in teams:
        raise ApiError(400, f"{body.team} doesn't play in Week {body.week}")
    try:
        check_pick({int(w): t for w, t in entry["picks"].items()}, body.week, body.team)
    except ValueError as e:
        raise ApiError(409, str(e))

    try:
        item = table.update_item(
            Key=key,
            UpdateExpression="SET picks.#w = :team",
            # Grading may have eliminated the entry since the read above.
            ConditionExpression="attribute_not_exists(eliminatedWeek)",
            ExpressionAttributeNames={"#w": str(body.week)},
            ExpressionAttributeValues={":team": body.team},
            ReturnValues="ALL_NEW",
        )["Attributes"]
    except table.meta.client.exceptions.ConditionalCheckFailedException:
        raise ApiError(409, f"{entry['label']} has been eliminated")
    return respond(200, {k: item[k] for k in ("entryId", "label", "picks")})
