"""Addresses SES reported as a hard bounce or complaint: `SUPPRESS` / `<address>` in pickem-ops."""

import os
from datetime import datetime, timezone

import boto3

dynamodb = boto3.resource("dynamodb")


def _key(address: str) -> dict:
    return {"PK": "SUPPRESS", "SK": address.strip().lower()}


def suppress(address: str, reason: str) -> None:
    dynamodb.Table(os.environ["OPS_TABLE"]).put_item(
        Item={**_key(address), "reason": reason, "at": datetime.now(timezone.utc).isoformat(timespec="seconds")}
    )


def is_suppressed(address: str) -> bool:
    return "Item" in dynamodb.Table(os.environ["OPS_TABLE"]).get_item(Key=_key(address))
