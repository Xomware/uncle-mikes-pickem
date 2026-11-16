"""pickem-mail-sweep: sends every email that is due (BRAINSTORM.md 3A). Scheduled every 10 minutes.

Reads the EVENTS rows grading wrote to pickem-ops since its cursor and turns each
into one email per recipient, then sends what the clock makes due (reminders),
keyed by group and week (`remind24#W05`). Every send goes through mailer.deliver,
whose claim on the event id makes a rerun, an overlap or a re-read event a no-op.

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
from boto3.dynamodb.conditions import Attr, Key

from lambdas.common import death, flags, gow, gow_link, mailer, nfl_store, notices
from lambdas.common.groups import ORGANIZERS
from lambdas.common.weeks import week_pk

log = logging.getLogger()
log.setLevel(logging.INFO)

CURSOR = {"PK": "CURSOR", "SK": "mail_sweep"}
# emit() stamps the time before its put lands, so a row can appear behind one
# already read. Re-reading a window behind the cursor costs only dup claims.
OVERLAP = timedelta(minutes=30)
REMIND_EARLY, REMIND_LATE = timedelta(hours=24), timedelta(hours=2)
# Opens Monday 9:00 ET for the Tuesday-noon deadline: after the weekend, before the auto-pick.
GOW_LEAD = timedelta(hours=27)
# The super admin's off switch for each email preference kind (common/flags.py).
KIND_FLAGS = {"results": "emailResults", "reminders": "emailReminders", "death": "emailDeath", "gowAdmin": "emailGowAdmin"}

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
    # result#W05#v2 and later follow a regrade that changed the winners. It's a correction only
    # to a member who got an earlier announcement; one skipped as superseded never went out.
    base, _, version = event["eventId"].partition("#v")
    earlier = [base] + [f"{base}#v{v}" for v in range(2, int(version or 1))]
    previous = event["payload"].get("previous", [])
    for m in roster:
        if m["sub"] in result["members"]:
            ctx = notices.week_ctx(result, games, sheets, standings, names, m["sub"])
            correction = bool(version) and any(mailer.was_sent(m["sub"], gid, e) for e in earlier)
            was = ["You" if s == m["sub"] else names.get(s, "a former member") for s in previous]
            yield m, "results", "week_result", {**ctx, "correction": correction, "previous": was}


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
    return deliver_all(group, event["eventId"], list(build(group, event)), now)


def deliver_all(group: dict, event_id: str, outs: list[tuple], now: datetime) -> Counter:
    """Send each (member, kind, template, context) under one event id."""
    to = addresses([m["sub"] for m, *_ in outs])
    counts = Counter()
    for member, kind, template, ctx in outs:
        # Skipped before the claim, so turning the flag back on sends whatever is still due.
        if not flags.enabled(KIND_FLAGS[kind], group["groupId"]):
            counts["flagoff"] += 1
            continue
        if member["sub"] not in to:
            counts["noaddress"] += 1
            continue
        ctx = {**ctx, "name": member["name"], "group_name": member["groupName"], "group_id": group["groupId"]}
        counts[mailer.deliver(member, to[member["sub"]], kind, template, event_id, ctx, now)] += 1
    return counts


def all_groups():
    # INVITE#code items also use SK META.
    kwargs = {"FilterExpression": Attr("SK").eq("META") & Attr("PK").begins_with("GROUP#")}
    while True:
        page = app().scan(**kwargs)
        yield from page["Items"]
        if "LastEvaluatedKey" not in page:
            return
        kwargs["ExclusiveStartKey"] = page["LastEvaluatedKey"]


def reminder_due(now: datetime, lock: datetime) -> int | None:
    """24 or 2: which reminder the time to lock falls in, if any. A sweep that misses
    the 24 h mark still sends it until the 2 h one takes over."""
    left = lock - now
    if timedelta(0) < left <= REMIND_LATE:
        return 2
    if REMIND_LATE < left <= REMIND_EARLY:
        return 24
    return None


def reminders(group: dict, feed: nfl_store.Feed, n: int, nfl_week: dict, items: list[dict], hours: int):
    """Members whose week-n sheet isn't complete, or who own a live death entry with no week-n pick."""
    gid, season = group["groupId"], feed.season
    roster = query(app(), Key("PK").eq(f"GROUP#{gid}"))
    lives = death.start_lives([i for i in roster if i["SK"].startswith(f"RULES#S{season}#")])
    sheets = {i["sub"]: i for i in items if i["SK"].startswith("PICK#")}
    entries = death_entries(gid, season)
    # Once one entry is left the pool is over and nobody owes a pick.
    live = notices.alive(entries) > 1
    open_entries = [e for e in entries if live and not e.get("eliminatedWeek") and str(n) not in e["picks"]]
    for m in (i for i in roster if i["SK"].startswith("MEMBER#")):
        sheet = sheets.get(m["sub"])
        mine = [e for e in open_entries if e["ownerSub"] == m["sub"]]
        if (sheet and sheet["complete"]) and not mine:
            continue
        yield m, "reminders", "reminder", notices.reminder_ctx(n, hours, nfl_week["lockAt"], sheet, mine, lives)


def scheduled(now: datetime) -> Counter:
    """Time-based mail, judged per group on its own feed, so a replay group runs on its virtual clock."""
    counts = Counter()
    for group in all_groups():
        feed = nfl_store.for_group(group)
        n = (feed.last_locked_week() or 0) + 1
        nfl_week = feed.week(n)
        if not nfl_week:
            continue
        items = query(app(), Key("PK").eq(week_pk(group["groupId"], feed.season, n)))
        hours = reminder_due(feed.now, nfl_store.parse(nfl_week["lockAt"]))
        if hours:
            outs = list(reminders(group, feed, n, nfl_week, items, hours))
            counts += deliver_all(group, f"remind{hours}#W{n:02d}", outs, now)
        chosen = next((i for i in items if i["SK"] == "GOW"), None)
        if chosen:
            # Keyed on the game too, so an organizer changing the GOW announces the new one.
            outs = list(announce_gow(group, feed, n, nfl_week, items, chosen))
            counts += deliver_all(group, f"gowset#W{n:02d}#{chosen['gameId']}", outs, now)
        deadline = gow.deadline(nfl_week["lockAt"])
        if not chosen and deadline - GOW_LEAD <= feed.now < deadline:
            outs = list(gow_admin(group, feed, n, nfl_week, items, deadline))
            counts += deliver_all(group, f"gowpick#W{n:02d}", outs, now)
    return counts


def announce_gow(group: dict, feed: nfl_store.Feed, n: int, nfl_week: dict, items: list[dict], chosen: dict):
    """"GOW is set, picks are open" to every member whose week-n sheet isn't complete yet."""
    game = next((g for g in feed.games(n) if g["gameId"] == chosen["gameId"]), None)
    if not game:
        return
    done = {i["sub"] for i in items if i["SK"].startswith("PICK#") and i["complete"]}
    roster = members(group["groupId"])
    names = {m["sub"]: m["name"] for m in roster}
    ctx = notices.gow_set_ctx(n, game, names.get(chosen["chosenBy"]), nfl_week["lockAt"])
    for m in roster:
        if m["sub"] not in done:
            yield m, "reminders", "gow_set", ctx


def gow_admin(group: dict, feed: nfl_store.Feed, n: int, nfl_week: dict, items: list[dict], deadline: datetime):
    """Organizers get the top-3 hype games as signed links. `items` is the week-n partition, which has no GOW."""
    gid, season = group["groupId"], feed.season
    canceled = next((set(i["gameIds"]) for i in items if i["SK"] == "CANCELED"), set())
    games = [g for g in feed.games(n) if g["gameId"] not in canceled]
    # sorted is stable over kickoff order, so the earlier game wins a hype tie, as in gow.top_game.
    top = sorted(games, key=lambda g: -(g.get("hype") or {}).get("score", 0))[:3]
    lock = nfl_store.parse(nfl_week["lockAt"])
    for m in members(gid):
        if m["role"] in ORGANIZERS:
            tokens = [gow_link.make_token(gid, season, n, g["gameId"], m["sub"], lock) for g in top]
            yield m, "gowAdmin", "gow_admin", notices.gow_admin_ctx(n, top, tokens, deadline, len(games))


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
    now = datetime.now(timezone.utc)
    flags.reset()
    counts = drain(now) + scheduled(now)
    log.info("mail sweep %s", dict(counts))
    return dict(counts)
