"""pickem-writeups: a Film Room preview per game (F12.3, common/writeup.py).

Scheduled Wednesday and Saturday 10:00 ET for the week ESPN calls current. A game
is written once it has facts and rewritten only when they change, and never after
kickoff. {"force": true, "season": 2026, "week": 12} rewrites every game in a week.
Real season only: replay groups read whatever WRITEUP rows exist.

One game failing (ESPN, the API) doesn't stop the rest. The run raises at the end
so the alarm fires, and the scheduler's retry redoes only the failed games.
"""

from __future__ import annotations

import logging
import os
from collections import Counter

import anthropic
import boto3

from lambdas.common import clock, game_view, nfl_store, writeup
from lambdas.common.api import ApiError

log = logging.getLogger()
log.setLevel(logging.INFO)


def api_key() -> str:
    ssm = boto3.client("ssm")
    return ssm.get_parameter(Name=os.environ["ANTHROPIC_KEY_PARAM"], WithDecryption=True)["Parameter"]["Value"]


def write(client, feed: nfl_store.Feed, game: dict, force: bool) -> str:
    """What happened to one game, as a count key."""
    if game["state"] != "pre" and not force:
        return "started"
    info, source = game_view.cached(game, feed)
    facts = writeup.fact_pack(game_view.payload(game, info, source, feed.now))
    facts_hash = writeup.digest(facts)
    old = writeup.get(game["gameId"])
    if old and old["factsHash"] == facts_hash and not force:
        return "unchanged"
    text = writeup.generate(client, facts)
    if text is None:
        log.warning("no write-up for %s: refused or cut off", game["gameId"])
        return "refused"
    writeup.save(game["gameId"], text, facts_hash, nfl_store.iso(feed.now))
    return "written"


def handler(event, context):
    force = bool(event.get("force"))
    if "week" in event:
        season, week = int(event["season"]), int(event["week"])
    else:
        current = nfl_store.current_week()
        if current is None:
            return {}
        season, week = current
    feed = nfl_store.Feed(season, False, clock.now())
    client = anthropic.Anthropic(api_key=api_key())

    counts = Counter()
    for game in feed.games(week):
        try:
            counts[write(client, feed, {**game, "week": week}, force)] += 1
        except (ApiError, anthropic.APIError):
            log.exception("write-up failed for %s", game["gameId"])
            counts["failed"] += 1
    log.info("writeups %d W%d %s", season, week, dict(counts))
    if counts["failed"]:
        raise RuntimeError(f"{counts['failed']} write-ups failed for {season} W{week}")
    return dict(counts)
