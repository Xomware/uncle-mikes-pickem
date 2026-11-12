"""Domain events in pickem-ops, for the result and elimination emails to send from.

    EVENTS / <at>#<groupId>#<eventId>   type, groupId, season, week, eventId, payload

Grading writes them; nothing sends from them yet. A consumer queries PK = EVENTS
with SK past its last cursor. eventId is the mailer's claim key (mailer.claim), so
replaying a range of events can't send twice. A correction after an event went out
gets a new eventId (`result#W05#v2`), never the old one again.
"""

import os
from datetime import timedelta

import boto3

from lambdas.common import clock, nfl_store

TTL = timedelta(days=400)

dynamodb = boto3.resource("dynamodb")


def emit(kind: str, group_id: str, season: int, week: int, event_id: str, payload: dict) -> None:
    now = clock.now()
    dynamodb.Table(os.environ["OPS_TABLE"]).put_item(
        Item={
            "PK": "EVENTS",
            "SK": f"{nfl_store.iso(now)}#{group_id}#{event_id}",
            "type": kind,
            "groupId": group_id,
            "season": season,
            "week": week,
            "eventId": event_id,
            "payload": payload,
            "ttl": int((now + TTL).timestamp()),
        }
    )
