"""Win odds items, rewritten by results.regrade alongside RESULT (PLAN.md F13).

    GROUP#g#S2026#W10 / ANALYTICS   the week's win odds and rooting guide
    GROUP#g#S2026     / ANALYTICS   each season member's chance to win the year

Recomputed when a RESULT changes (a final, an override, a new sheet) or when the stored
item is missing or predates MODEL. Lines aren't RESULT inputs, so a line that moves between
lock and a later kickoff shows up at the next final. Model: ANALYTICS.md.
"""

from __future__ import annotations

import json
import random
from decimal import Decimal

from boto3.dynamodb.conditions import Key

from lambdas.common import clock, grade, nfl_store, odds, season as season_fold, winprob
from lambdas.common.death import entries_pk
from lambdas.common.rules import rules_for
from lambdas.common.weeks import week_pk

MODEL = 1
LAST_WEEK = 18
OPEN = "open"


def stale(item: dict | None) -> bool:
    return not item or item.get("model") != MODEL


def week_odds(result: dict, games: list[dict], week_items: list[dict], rules: dict) -> tuple[dict, dict]:
    """(the ANALYTICS body, the raw sim) for one graded week. Sheets are the ones RESULT graded."""
    picks = {i["sub"]: i for i in week_items if i["SK"].startswith("PICK#")}
    graded = [s for s, row in result["members"].items() if not row["missed"]]
    decided = {gid: o["result"] for gid, o in result["games"].items() if o}
    results = decided | {gid: grade.CANCELED for gid in result["canceled"]}
    by_id = {g["gameId"]: g for g in games}
    lines = {gid: odds.home_win(g.get("lines")) for gid, g in by_id.items() if gid not in results}
    open_games = {gid: (by_id[gid]["away"]["abbr"], by_id[gid]["home"]["abbr"], p) for gid, (p, _) in lines.items()}
    tiebreak = by_id.get(result["tiebreakGameId"]) or {}

    sim = winprob.week(
        {s: picks[s]["picks"] for s in graded},
        results,
        open_games,
        result["gowGameId"],
        rules,
        {s: picks[s]["tiebreak"] for s in graded},
        result["tiebreakTotal"],
        (tiebreak.get("lines") or {}).get("overUnder"),
        # Seeded on the inputs, so an unchanged week gives the same numbers.
        random.Random(result["inputHash"]),
        winprob.sims_for(len(graded), len(open_games)),
    )
    body = {
        "week": result["week"],
        "model": MODEL,
        "sims": sim["sims"],
        "status": result["status"],
        "games": {gid: {"pHome": round(p, 4), "source": source} for gid, (p, source) in lines.items()},
        "members": {s: {"pWin": sim["pWin"][s], "root": sim["root"][s]} for s in sim["subs"]},
    }
    return body, sim


def season_odds(found: list[dict], members: list[dict], open_sim: dict | None) -> dict:
    """The season ANALYTICS body. The latest week counts through `open_sim` while it's open;
    every other week counts as graded, even one still waiting on a postponed game."""
    subs = [m["sub"] for m in members if m["entryType"] == "season"]
    latest = found[-1]
    sim = open_sim if latest["status"] == OPEN else None
    done = found[:-1] if sim else found
    rows = {s: [r["members"][s] for r in done if s in r["members"]] for s in subs}
    known = {s: (sum(r["yearly"] for r in rows[s]), sum(r["gow"] for r in rows[s])) for s in subs}
    history = {s: [r["yearly"] for r in rows[s]] for s in subs}
    rng = random.Random("".join(r["inputHash"] for r in found))
    out = winprob.season(known, history, sim, LAST_WEEK - latest["week"], rng)
    return {"model": MODEL, "throughWeek": latest["week"], "sims": winprob.SIMS, "members": out}


def refresh_season(table, group: dict, feed: nfl_store.Feed, members: list[dict], versions: list[dict], last: int, sims: dict) -> bool:
    """Rewrite the season item when a week changed (`sims` holds that run's week sims) or it's stale."""
    gid, season = group["groupId"], feed.season
    key = {"PK": entries_pk(gid, season), "SK": "ANALYTICS"}
    if not sims and not stale(table.get_item(Key=key).get("Item")):
        return False
    found = season_fold.week_results(table, gid, season, last)
    if not found or not any(m["entryType"] == "season" for m in members):
        return False
    latest = found[-1]
    sim = sims.get(latest["week"])
    if latest["status"] == OPEN and sim is None:
        pk = week_pk(gid, season, latest["week"])
        items = nfl_store.plain(table.query(KeyConditionExpression=Key("PK").eq(pk))["Items"])
        _, sim = week_odds(latest, feed.games(latest["week"]), items, rules_for(versions, latest["week"]))
    save(table, key["PK"], season_odds(found, members, sim), group)
    return True


def save(table, pk: str, body: dict, group: dict) -> None:
    item = {"PK": pk, "SK": "ANALYTICS", **body, "computedAt": nfl_store.iso(clock.now(group))}
    table.put_item(Item=json.loads(json.dumps(item), parse_float=Decimal))
