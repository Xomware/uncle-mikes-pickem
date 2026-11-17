"""Scheduled job runs in pickem-ops: `POLL#<job>` / <ISO time>, read by the super admin overview.

A run that raised has an `error` and is written before the re-raise, so the Errors alarm still fires.
"""

import os
from datetime import datetime, timedelta

import boto3
from boto3.dynamodb.conditions import Key

from lambdas.common import nfl_store

JOBS = ("cron_tick", "capture", "mail_sweep")
TTL = timedelta(days=30)


def record(job: str, now: datetime, result: dict) -> None:
    boto3.resource("dynamodb").Table(os.environ["OPS_TABLE"]).put_item(
        Item={"PK": f"POLL#{job}", "SK": nfl_store.iso(now), **result, "ttl": int((now + TTL).timestamp())}
    )


def recent(job: str, limit: int) -> list[dict]:
    """Newest first."""
    return boto3.resource("dynamodb").Table(os.environ["OPS_TABLE"]).query(
        KeyConditionExpression=Key("PK").eq(f"POLL#{job}"), ScanIndexForward=False, Limit=limit
    )["Items"]
