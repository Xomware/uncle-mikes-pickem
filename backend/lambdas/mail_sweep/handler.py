"""pickem-mail-sweep: sends every email that is due (BRAINSTORM.md 3A). Scheduled every 10 minutes.

Reads the EVENTS rows grading wrote to pickem-ops since its cursor and turns each
into one email per recipient. Every send goes through mailer.deliver, whose claim
on the event id makes a rerun, an overlap or a re-read event a no-op.

A Lambda of its own rather than a cron_tick hook: cron_tick raises on an ESPN
outage and skips most minutes outside game windows, and mail shouldn't wait on
either. It also keeps ses:SendEmail and the link keys off the one function that
writes pickem-nfl.
"""

from __future__ import annotations

import logging
import os
from collections import Counter
from datetime import datetime, timedelta, timezone

import boto3
from boto3.dynamodb.conditions import Key

from lambdas.common import death, mailer, nfl_store, notices
from lambdas.common.weeks import week_pk

log = logging.getLogger()
log.setLevel(logging.INFO)

CURSOR = {"PK": "CURSOR", "SK": "mail_sweep"}
# emit() stamps the time before its put lands, so a row can appear behind one
# already read. Re-reading a window behind the cursor costs only dup claims.
OVERLAP = timedelta(minutes=30)

dynamodb = boto3.resource("dynamodb")


def app():
    return dynamodb.Table(os.environ["APP_TABLE"])


def ops():
    return dynamodb.Table(os.environ["OPS_TABLE"])


def query(table, condition) -> list[dict]:
    kwargs = {"KeyConditionExpression": condition}
    items = []
    while True:
        page = table.query(**kwargs)
        items += page["Items"]
        if "LastEvaluatedKey" not in page:
            return nfl_store.plain(items)
        kwargs["ExclusiveStartKey"] = page["LastEvaluatedKey"]


def members(group_id: str) -> list[dict]:
    return query(app(), Key("PK").eq(f"GROUP#{group_id}") & Key("SK").begins_with("MEMBER#"))


def addresses(subs: list[str]) -> dict[str, str]:
    """{sub: email} from each USER PROFILE. A member who never loaded their profile has none."""
    if not subs:
        return {}
    name = os.environ["APP_TABLE"]
    keys = [{"PK": f"USER#{s}", "SK": "PROFILE"} for s in sorted(set(subs))]
    found = {}
    for i in range(0, len(keys), 100):
        request = {name: {"Keys": keys[i:i + 100], "ProjectionExpression": "PK, email"}}
        while request:
            resp = dynamodb.batch_get_item(RequestItems=request)
            found |= {p["PK"].removeprefix("USER#"): p["email"] for p in resp["Responses"][name]}
            request = resp.get("UnprocessedKeys")
    return found


def week_results(group: dict, event: dict):
    """week_confirmed: every member on the week's board gets their results."""
    gid, season, week = group["groupId"], int(event["season"]), int(event["week"])
    items = query(app(), Key("PK").eq(week_pk(gid, season, week)))
    result = next((i for i in items if i["SK"] == "RESULT"), None)
    # A later regrade changed the winners; its own event (#v2) carries the current story.
    if not result or result["winners"] != event["payload"]["winners"]:
        return
    sheets = {i["sub"]: i for i in items if i["SK"].startswith("PICK#")}
    key = {"PK": death.entries_pk(gid, season), "SK": "STANDINGS"}
    standings = nfl_store.plain(app().get_item(Key=key).get("Item"))
    games = nfl_store.for_group(group).games(week)
    roster = members(gid)
    names = {m["sub"]: m["name"] for m in roster}
    for m in roster:
        if m["sub"] in result["members"]:
            yield m, "results", "week_result", notices.week_ctx(result, games, sheets, standings, names, m["sub"])


def death_entries(gid: str, season: int) -> list[dict]:
    return query(app(), Key("PK").eq(death.entries_pk(gid, season)) & Key("SK").begins_with("DEATH#"))


def death_entry(group: dict, event: dict):
    """entry_eliminated and life_lost: the entry's owner hears about it, unless a regrade has since undone it."""
    gid, season, week = group["groupId"], int(event["season"]), int(event["week"])
    entries = death_entries(gid, season)
    entry = next((e for e in entries if e["entryId"] == event["payload"]["entryId"]), None)
    out = event["type"] == "entry_eliminated"
    if not entry or (entry.get("eliminatedWeek") != week if out else entry.get("livesLeft", 0) > 1):
        return
    result = app().get_item(Key={"PK": week_pk(gid, season, week), "SK": "RESULT"}).get("Item") or {}
    owner = next((m for m in members(gid) if m["sub"] == entry["ownerSub"]), None)
    if owner:
        ctx = notices.death_ctx(entry, week, result.get("teams", {}), entries)
        yield owner, "death", "death_out" if out else "death_life", ctx


def death_revived(group: dict, event: dict):
    """death_revived: each owner of a revived entry gets one email naming theirs."""
    gid, season, week = group["groupId"], int(event["season"]), int(event["week"])
    entries = death_entries(gid, season)
    revived = [e for e in entries if e["entryId"] in event["payload"]["entryIds"]]
    for m in members(gid):
        mine = [e["label"] for e in revived if e["ownerSub"] == m["sub"]]
        if mine:
            yield m, "death", "death_revived", notices.revived_ctx(week, mine, entries)


EVENTS = {
    "week_confirmed": week_results,
    "entry_eliminated": death_entry,
    "life_lost": death_entry,
    "death_revived": death_revived,
}


def send_event(event: dict, now: datetime) -> Counter:
    build = EVENTS.get(event["type"])
    if not build:
        return Counter(skipped=1)
    group = app().get_item(Key={"PK": f"GROUP#{event['groupId']}", "SK": "META"}).get("Item")
    if not group:
        return Counter(skipped=1)
    outs = list(build(group, event))
    to = addresses([m["sub"] for m, *_ in outs])
    counts = Counter()
    for member, kind, template, ctx in outs:
        if member["sub"] not in to:
            counts["noaddress"] += 1
            continue
        ctx = {**ctx, "name": member["name"], "group_name": member["groupName"], "group_id": group["groupId"]}
        counts[mailer.deliver(member, to[member["sub"]], kind, template, event["eventId"], ctx, now)] += 1
    return counts


def drain(now: datetime) -> Counter:
    """Send for each event after the cursor, then move it to the first event with a failed send, or the last read.

    With no cursor yet (first deploy) the sweep starts OVERLAP back, rather than mailing every past event.
    """
    cursor = (ops().get_item(Key=CURSOR).get("Item") or {}).get("at") or nfl_store.iso(now)
    start = nfl_store.iso(nfl_store.parse(cursor) - OVERLAP)
    rows = query(ops(), Key("PK").eq("EVENTS") & Key("SK").gt(start))
    counts, stop = Counter(), None
    for row in rows:
        sent = send_event(row, now)
        counts += sent
        if sent["failed"] and stop is None:
            stop = row["SK"].split("#")[0]
    last = rows[-1]["SK"].split("#")[0] if rows else cursor
    ops().put_item(Item={**CURSOR, "at": stop or max(last, cursor)})
    return counts


def handler(event, context):
    counts = drain(datetime.now(timezone.utc))
    log.info("mail sweep %s", dict(counts))
    return dict(counts)
