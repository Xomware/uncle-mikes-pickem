"""GET /super/overview: counts, this week's picks per group, scheduled job health and mail volume. Super admin only.

The site header also calls it to decide whether to show the Admin link.
"""

import os
from collections import Counter
from datetime import datetime, timedelta, timezone

import boto3
from boto3.dynamodb.conditions import Attr, Key

from lambdas.common import nfl_store, runs, superadmin
from lambdas.common.api import api_handler, respond
from lambdas.common.weeks import week_pk

dynamodb = boto3.resource("dynamodb")


def this_week(group: dict, members: int) -> dict:
    """The group's open week on its own feed, so a replay group reports its virtual week."""
    feed = nfl_store.for_group(group)
    week = (feed.last_locked_week() or 0) + 1
    condition = Key("PK").eq(week_pk(group["groupId"], feed.season, week)) & Key("SK").begins_with("PICK#")
    picks = dynamodb.Table(os.environ["APP_TABLE"]).query(KeyConditionExpression=condition)["Items"]
    return {
        "groupId": group["groupId"],
        "name": group["name"],
        "members": members,
        "week": week,
        "submitted": len(picks),
        "complete": sum(1 for p in picks if p.get("complete")),
    }


def last_run(job: str) -> dict | None:
    rows = runs.recent(job, 1)
    if not rows:
        return None
    return {"at": rows[0]["SK"], "ok": "error" not in rows[0], "error": rows[0].get("error"), "mode": rows[0].get("mode")}


def errors() -> list[dict]:
    """Failed runs from the last 50 of each job. Only runs record errors; API errors live in CloudWatch."""
    out = [{"job": job, "at": r["SK"], "error": r["error"]} for job in runs.JOBS for r in runs.recent(job, 50) if "error" in r]
    return sorted(out, key=lambda e: e["at"], reverse=True)[:20]


def mail(now: datetime) -> dict:
    """From the mailer's claim log: one row per email attempted."""
    claims = superadmin.scan(
        "OPS_TABLE",
        FilterExpression=Attr("PK").begins_with("MAIL#"),
        ProjectionExpression="#s, #a",
        ExpressionAttributeNames={"#s": "status", "#a": "at"},
    )
    sent = [c["at"] for c in claims if c["status"] == "sent"]
    day, week = (nfl_store.iso(now - timedelta(days=d)) for d in (1, 7))
    return {
        "sent24h": sum(1 for at in sent if at >= day),
        "sent7d": sum(1 for at in sent if at >= week),
        "sentTotal": len(sent),
        "failed": sum(1 for c in claims if c["status"] == "failed"),
    }


@api_handler("super_overview")
def handler(event, context):
    superadmin.require(event)
    rows = superadmin.scan(
        "APP_TABLE",
        FilterExpression=superadmin.GROUPS | Attr("SK").begins_with("MEMBER#") | Attr("SK").eq("PROFILE"),
    )
    groups = sorted((r for r in rows if r["SK"] == "META"), key=lambda g: g["name"].lower())
    members = Counter(r["PK"] for r in rows if r["SK"].startswith("MEMBER#"))
    return respond(
        200,
        {
            "groups": len(groups),
            "users": sum(1 for r in rows if r["SK"] == "PROFILE"),
            "perGroup": [this_week(g, members[g["PK"]]) for g in groups],
            "jobs": {job: last_run(job) for job in runs.JOBS},
            "errors": errors(),
            "mail": mail(datetime.now(timezone.utc)),
        },
    )
