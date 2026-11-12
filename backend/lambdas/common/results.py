"""Regrade: the RESULT item per group-week (BRAINSTORM.md 2A, PLAN.md 7.3).

    GROUP#g#S2027#W05 / RESULT             derived; nobody edits it
    GROUP#g#S2027#W05 / OVERRIDE#<gameId>  the organizer's final score for a game, an input

RESULT is a cache of week_result() over the week's inputs: members, picks, GOW,
canceled games, overrides, finals and the rules in force. It is rewritten only
when inputHash changes, so regrading an unchanged week reads and stops.
Corrections go in as inputs, followed by a regrade.
"""

from __future__ import annotations

import hashlib
import json
from collections.abc import Iterable
from decimal import Decimal

from boto3.dynamodb.conditions import Key

from lambdas.common import clock, events, finals, grade, nfl_store, season as season_fold, standings
from lambdas.common.rules import rules_for
from lambdas.common.weeks import week_pk

OPEN, PROVISIONAL, FINAL = "open", "provisional", "final"


def outcome(game: dict, override: dict | None, replay: bool) -> dict | None:
    """A game's final score and result, or None while it's unfinished. An override beats the feeds."""
    if override:
        away, home, confirmed = override["awayScore"], override["homeScore"], True
    elif game.get("completed"):
        # Replay finals are nflverse's own, so they need no second source.
        away, home, confirmed = game["awayScore"], game["homeScore"], replay or finals.confirmed(game)
    else:
        return None
    result = grade.TIE if away == home else game["away"]["abbr"] if away > home else game["home"]["abbr"]
    return {"awayScore": away, "homeScore": home, "result": result, "confirmed": confirmed}


def team_results(games: list[dict], outcomes: dict[str, dict | None]) -> dict[str, str]:
    """{team: W | L | T} for the finished games, in death.fold's terms."""
    out = {}
    for g in games:
        o = outcomes.get(g["gameId"])
        if not o:
            continue
        for side in ("away", "home"):
            team = g[side]["abbr"]
            out[team] = "T" if o["result"] == grade.TIE else "W" if o["result"] == team else "L"
    return out


def week_result(
    week: int, games: list[dict], items: list[dict], members: list[dict], versions: list[dict], tiebreak_id: str, replay: bool
) -> dict:
    """RESULT for one group-week. `items` is the group-week partition; everything is plain (no Decimals)."""
    picks = {i["sub"]: i for i in items if i["SK"].startswith("PICK#")}
    canceled = next((set(i["gameIds"]) for i in items if i["SK"] == "CANCELED"), set())
    overrides = {i["SK"].removeprefix("OVERRIDE#"): i for i in items if i["SK"].startswith("OVERRIDE#")}
    gow_id = next((i["gameId"] for i in items if i["SK"] == "GOW"), None)
    rules = rules_for(versions, week)

    played = [g for g in games if g["gameId"] not in canceled]
    outcomes = {g["gameId"]: outcome(g, overrides.get(g["gameId"]), replay) for g in played}
    # A game canceled after lock stays on the sheets and voids to 0; nothing is re-ranked.
    results = {gid: o["result"] for gid, o in outcomes.items() if o} | {gid: grade.CANCELED for gid in canceled}

    subs = sorted(m["sub"] for m in members)
    # A sheet left incomplete at lock is a missed week.
    sheets = {s: picks[s] for s in subs if s in picks and picks[s]["complete"]}
    graded = {s: grade.grade(p["picks"], results, gow_id, rules) for s, p in sheets.items()}
    board = standings.week_board(graded, subs, [m["sub"] for m in members if m["entryType"] == "season"])
    for s, row in board.items():
        row["games"] = graded[s]["games"] if s in graded else {}

    done = all(outcomes.values())
    status = FINAL if done and all(o["confirmed"] for o in outcomes.values()) else PROVISIONAL if done else OPEN
    tiebreak = outcomes.get(tiebreak_id)
    total = tiebreak["awayScore"] + tiebreak["homeScore"] if tiebreak else None
    winners = []
    if done:
        weekly = {s: board[s]["weekly"] for s in sheets}
        winners = standings.weekly_winners(weekly, {s: p["tiebreak"] for s, p in sheets.items()}, total)

    inputs = [
        sorted((m["sub"], m["entryType"]) for m in members),
        {s: [p["picks"], p["tiebreak"]] for s, p in sheets.items()},
        gow_id, sorted(canceled), outcomes, rules, tiebreak_id,
    ]
    return {
        "week": week,
        "status": status,
        "rulesVersion": max((v["version"] for v in versions if v["effectiveWeek"] <= week), default=0),
        "inputHash": hashlib.sha256(json.dumps(inputs, sort_keys=True).encode()).hexdigest(),
        "gowGameId": gow_id,
        "tiebreakGameId": tiebreak_id,
        "tiebreakTotal": total,
        "canceled": sorted(canceled),
        "games": outcomes,
        "teams": team_results(played, outcomes),
        "members": board,
        "winners": winners,
    }


def save(table, pk: str, group_id: str, season: int, result: dict, old: dict) -> None:
    """Write RESULT, emitting week_confirmed when a final week's winners differ from the last ones announced.

    The first announcement is `result#W05`; a regrade that flips the winners after that is `#v2`, and so on.
    """
    week = result["week"]
    announced, count = old.get("announcedWinners"), old.get("announcements", 0)
    if result["status"] == FINAL and result["winners"] != announced:
        count += 1
        event_id = f"result#W{week:02d}" + (f"#v{count}" if count > 1 else "")
        # Emitted before the write: a crash between them re-emits the same eventId, which the mailer dedupes.
        events.emit("week_confirmed", group_id, season, week, event_id, {"winners": result["winners"]})
        announced = result["winners"]
    item = {
        "PK": pk, "SK": "RESULT", "groupId": group_id, "season": season, **result,
        "announcedWinners": announced, "announcements": count, "gradedAt": nfl_store.iso(clock.now()),
    }
    table.put_item(Item=json.loads(json.dumps(item), parse_float=Decimal))


def regrade(table, group: dict, weeks: Iterable[int] | None = None) -> dict:
    """Regrade `weeks`, or every locked week, then refold STANDINGS and the death pool.

    Returns {weeks: RESULTs rewritten, standings: rewritten?, eliminated: entry ids}.
    An unlocked week is skipped: its picks are hidden and still changing. The folds
    always run, since death picks aren't RESULT inputs.
    """
    feed = nfl_store.for_group(group)
    gid, season = group["groupId"], feed.season
    items = nfl_store.plain(table.query(KeyConditionExpression=Key("PK").eq(f"GROUP#{gid}"))["Items"])
    members = [i for i in items if i["SK"].startswith("MEMBER#")]
    versions = [i for i in items if i["SK"].startswith(f"RULES#S{season}#")]
    last = feed.last_locked_week() or 0
    changed = []
    for week in sorted(set(range(1, last + 1) if weeks is None else weeks)):
        if week > last:
            continue
        pk = week_pk(gid, season, week)
        week_items = nfl_store.plain(table.query(KeyConditionExpression=Key("PK").eq(pk))["Items"])
        tiebreak_id = feed.week(week)["tiebreakGameId"]
        result = week_result(week, feed.games(week), week_items, members, versions, tiebreak_id, feed.replay)
        old = next((i for i in week_items if i["SK"] == "RESULT"), {})
        if old.get("inputHash") == result["inputHash"]:
            continue
        save(table, pk, gid, season, result, old)
        changed.append(week)
    return {"weeks": changed, **season_fold.fold(table, gid, season, last, members, versions)}
