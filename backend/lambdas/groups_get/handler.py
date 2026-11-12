"""GET /groups/get?id=g: the group, its members, the caller's role and current settings. Members only."""

import os

import boto3
from boto3.dynamodb.conditions import Key

from lambdas.common import nfl_store
from lambdas.common.api import ApiError, api_handler, query_param, respond, user
from lambdas.common.groups import next_unlocked_week
from lambdas.common.rules import rules_for

dynamodb = boto3.resource("dynamodb")

RANK = {"owner": 0, "admin": 1, "member": 2}


@api_handler("groups_get")
def handler(event, context):
    me = user(event)
    gid = query_param(event, "id")
    items = dynamodb.Table(os.environ["APP_TABLE"]).query(KeyConditionExpression=Key("PK").eq(f"GROUP#{gid}"))["Items"]
    meta = next((i for i in items if i["SK"] == "META"), None)
    members = [i for i in items if i["SK"].startswith("MEMBER#")]
    mine = next((m for m in members if m["sub"] == me["sub"]), None)
    # A non-member can't tell a private group from a missing one.
    if not meta or not mine:
        raise ApiError(404, "Group not found")
    versions = [i for i in items if i["SK"].startswith(f"RULES#S{meta['season']}#")]

    return respond(
        200,
        {
            "group": {k: meta[k] for k in ("groupId", "name", "season", "ownerSub")},
            "role": mine["role"],
            "members": [
                {k: m.get(k) for k in ("sub", "name", "role", "entryType", "joinedWeek")}
                for m in sorted(members, key=lambda m: (RANK[m["role"]], m["name"].lower()))
            ],
            # What the next unlocked week will play under, which is what the settings form edits.
            "rules": rules_for(versions, next_unlocked_week(meta)),
            "rulesVersion": max((v["version"] for v in versions), default=0),
            # Replay groups only: the virtual clock and each week's lock, for the replay clock bar.
            "replay": {"clock": meta["clock"], "lockAts": nfl_store.replay_lock_ats(int(meta["season"]))}
            if meta.get("replay")
            else None,
        },
    )
