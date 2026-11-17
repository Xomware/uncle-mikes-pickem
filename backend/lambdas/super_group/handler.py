"""GET /super/group?id=g: one group as its organizer sees it, plus money and death pool totals. Super admin only, read-only."""

import os

import boto3
from boto3.dynamodb.conditions import Key

from lambdas.common import death, flags, ledger, superadmin
from lambdas.common.api import ApiError, api_handler, query_param, respond
from lambdas.common.groups import next_unlocked_week
from lambdas.common.rules import rules_for

dynamodb = boto3.resource("dynamodb")


@api_handler("super_group")
def handler(event, context):
    superadmin.require(event)
    gid = query_param(event, "id")
    table = dynamodb.Table(os.environ["APP_TABLE"])

    def partition(pk):
        return table.query(KeyConditionExpression=Key("PK").eq(pk))["Items"]

    items = partition(f"GROUP#{gid}")
    meta = next((i for i in items if i["SK"] == "META"), None)
    if not meta:
        raise ApiError(404, "Group not found")
    season = int(meta["season"])
    members = sorted((i for i in items if i["SK"].startswith("MEMBER#")), key=lambda m: m["name"].lower())
    versions = [i for i in items if i["SK"].startswith(f"RULES#S{season}#")]
    through = next_unlocked_week(meta) - 1
    rules = rules_for(versions, through + 1)
    seasonal = partition(ledger.season_pk(gid, season))
    entries = [i for i in seasonal if i["SK"].startswith("DEATH#")]
    book = ledger.build(members, entries, [i for i in seasonal if i["SK"].startswith("PAY#")], versions, through)
    names = {m["sub"]: m["name"] for m in members}
    lives = death.start_lives(versions)

    return respond(
        200,
        {
            "group": {k: meta.get(k) for k in ("groupId", "name", "season", "ownerSub", "createdAt", "replay", "clock")},
            "members": [
                {k: m.get(k) for k in ("sub", "name", "role", "entryType", "joinedWeek", "joinedAt")} for m in members
            ],
            "rulesVersion": max((v["version"] for v in versions), default=0),
            "rules": rules,
            "payments": {
                "owed": sum(r["owed"] for r in book["members"]),
                "paid": sum(r["paid"] for r in book["members"]),
                "pots": book["pots"],
                "members": [{k: r[k] for k in ("sub", "name", "owed", "paid", "balance")} for r in book["members"]],
            },
            "death": {
                "alive": sum(1 for e in entries if not e.get("eliminatedWeek")),
                "entries": [
                    {
                        "label": e["label"],
                        "owner": names.get(e["ownerSub"]),
                        "livesLeft": e.get("livesLeft", lives),
                        "eliminatedWeek": e.get("eliminatedWeek"),
                    }
                    for e in sorted(entries, key=lambda e: e["label"])
                ],
            },
            "flags": flags.overrides(gid),
        },
    )
