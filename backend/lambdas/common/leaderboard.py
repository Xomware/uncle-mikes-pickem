"""The global leaderboard: every live group's current season, one row per player (issue #106).

    LEADERBOARD / S2026   rebuilt by cron_tick after any regrade and on the hourly sweep
    STATS / S2026         rebuilt beside it (common/app_stats.py)

Built from the RESULT items, so reading it costs one GetItem instead of a scan.
A player in several groups is ranked on their best entry. Rows carry a first name and
last initial, never the full name, and a groupId that standings_global names only to
that group's members.
"""

from __future__ import annotations

import math
from collections.abc import Iterable

from boto3.dynamodb.conditions import Key

from lambdas.common import app_stats, nfl_store, season as season_fold
from lambdas.common.weeks import week_pk

PK = "LEADERBOARD"
# Season pick % ranks only players with at least this share of the most-graded player's
# picks, so a 1-for-1 can't top it. The rest are listed below, unranked.
MIN_SHARE = 0.5
COUNTS = ("correct", "wrong", "ties", "points", "won")


def short_name(name: str) -> str:
    first, *rest = name.split() or ["Player"]
    return f"{first} {rest[-1][0].upper()}." if rest else first


def week_line(row: dict, won: bool) -> dict:
    marks = list(row["games"].values())
    return {
        "correct": marks.count("right"),
        "wrong": marks.count("wrong"),
        "ties": marks.count("tie"),
        "points": row["weekly"],
        "won": int(won),
    }


def graded(line: dict) -> int:
    return line["correct"] + line["wrong"] + line["ties"]


def pct(line: dict) -> float:
    return line["correct"] / graded(line) if graded(line) else 0.0


def group_lines(group_id: str, found: list[dict], members: list[dict], week: int) -> tuple[list[dict], list[dict]]:
    """(season lines, `week`'s lines) for one group. A missed sheet counts for nothing, not the missed score."""
    names = {m["sub"]: short_name(m["name"]) for m in members}
    totals: dict[str, dict] = {}
    latest = []
    for r in found:
        for sub, row in r["members"].items():
            # A member who has left has a row in old RESULTs but no MEMBER item.
            if row["missed"] or sub not in names:
                continue
            line = week_line(row, sub in r["winners"])
            total = totals.setdefault(sub, dict.fromkeys(COUNTS, 0))
            for k in COUNTS:
                total[k] += line[k]
            if r["week"] == week:
                latest.append({"sub": sub, "groupId": group_id, "name": names[sub], **line})
    overall = [{"sub": s, "groupId": group_id, "name": names[s], **t} for s, t in totals.items()]
    return overall, latest


def ranked(lines: Iterable[dict], key, qualified=lambda line: True) -> list[dict]:
    """Best entry per player, sorted by `key` descending, with competition ranks. Unqualified rows rank None."""
    best: dict[str, dict] = {}
    for line in lines:
        if line["sub"] not in best or key(line) > key(best[line["sub"]]):
            best[line["sub"]] = line
    rows = sorted(best.values(), key=lambda r: (not qualified(r), [-v for v in key(r)], r["name"]))
    out, prev = [], None
    for i, r in enumerate(rows):
        if not qualified(r):
            out.append({**r, "rank": None})
            continue
        out.append({**r, "rank": out[-1]["rank"] if key(r) == prev else i + 1})
        prev = key(r)
    return out


def board(groups: list[tuple[str, list[dict], list[dict]]], season: int) -> dict:
    """LEADERBOARD's body from (groupId, RESULTs, members) for each group."""
    week = max((r["week"] for _, found, _ in groups for r in found), default=0)
    overall, latest = [], []
    for gid, found, members in groups:
        o, w = group_lines(gid, found, members, week)
        overall += o
        latest += w
    min_graded = math.ceil(max((graded(o) for o in overall), default=0) * MIN_SHARE)
    return {
        "season": season,
        "week": week,
        "minGraded": min_graded,
        "overall": ranked(overall, lambda r: (pct(r), r["correct"], r["points"]), lambda r: graded(r) >= max(min_graded, 1)),
        "thisWeek": ranked(latest, lambda r: (r["correct"], r["points"])),
    }


def refresh(table, groups: Iterable[dict], season: int) -> bool:
    """Rebuild LEADERBOARD and STATS for `season` from its live groups. Writes only on a change; True if either did."""
    inputs, sheets = [], []
    for group in groups:
        if group.get("replay") or int(group["season"]) != season:
            continue
        gid = group["groupId"]
        last = nfl_store.for_group(group).last_locked_week() or 0
        found = season_fold.week_results(table, gid, season, last)
        members = nfl_store.plain(
            table.query(KeyConditionExpression=Key("PK").eq(f"GROUP#{gid}") & Key("SK").begins_with("MEMBER#"))["Items"]
        )
        inputs.append((gid, found, members))
        sheets.append((gid, found, {r["week"]: week_sheets(table, gid, season, r["week"]) for r in found}))
    # pct floats stay out of the item (DynamoDB wants Decimals); readers recompute them from the counts.
    wrote = save(table, PK, season, board(inputs, season))
    return save(table, app_stats.PK, season, app_stats.build(sheets, season)) or wrote


def week_sheets(table, group_id: str, season: int, week: int) -> dict[str, dict]:
    pk = week_pk(group_id, season, week)
    items = table.query(KeyConditionExpression=Key("PK").eq(pk) & Key("SK").begins_with("PICK#"))["Items"]
    return {i["sub"]: i for i in nfl_store.plain(items)}


def save(table, pk: str, season: int, body: dict) -> bool:
    key = {"PK": pk, "SK": f"S{season}"}
    old = table.get_item(Key=key).get("Item")
    if old and {k: v for k, v in nfl_store.plain(old).items() if k not in key} == body:
        return False
    table.put_item(Item={**key, **body})
    return True
