"""Season folds over a group's RESULT items, run after every regrade (PLAN.md 8.2, 9.2).

    GROUP#g#S2027 / STANDINGS        season table: season members only, yearly total, GOW tiebreak, places
    GROUP#g#S2027 / DEATH#<entryId>  livesLeft, and eliminatedWeek only once the entry is out

Both are full recomputes that write only what changed. The death fold reads only
the unbroken run of final weeks from Week 1: a provisional final can't eliminate
an entry, so no elimination is ever announced and then taken back by nflverse.
"""

from __future__ import annotations

from boto3.dynamodb.conditions import Key

from lambdas.common import death, events, nfl_store, standings
from lambdas.common.weeks import week_pk

FINAL = "final"


def week_results(table, group_id: str, season: int, last: int) -> list[dict]:
    """RESULT items for weeks 1..last, in week order. A week not graded yet is left out."""
    keys = ({"PK": week_pk(group_id, season, w), "SK": "RESULT"} for w in range(1, last + 1))
    return [nfl_store.plain(i) for i in (table.get_item(Key=k).get("Item") for k in keys) if i]


def season_table(found: list[dict], members: list[dict]) -> dict:
    names = {m["sub"]: m["name"] for m in members}
    season_subs = {m["sub"] for m in members if m["entryType"] == "season"}
    boards = [{s: row for s, row in r["members"].items() if s in season_subs} for r in found]
    rows = standings.season(boards)
    for row in rows:
        row["name"] = names[row["member"]]
        row["weeks"] = {str(r["week"]): r["members"].get(row["member"], {}).get("yearly") for r in found}
    return {
        "throughWeek": max((r["week"] for r in found), default=0),
        "final": all(r["status"] == FINAL for r in found),
        "rows": rows,
    }


def fold_standings(table, group_id: str, season: int, found: list[dict], members: list[dict]) -> bool:
    """Write STANDINGS when it changed. Returns whether it did."""
    key = {"PK": death.entries_pk(group_id, season), "SK": "STANDINGS"}
    body = {"groupId": group_id, "season": season, **season_table(found, members)}
    old = table.get_item(Key=key).get("Item")
    if old and {k: v for k, v in nfl_store.plain(old).items() if k not in key} == body:
        return False
    table.put_item(Item={**key, **body})
    return True


def fold_death(table, group_id: str, season: int, found: list[dict], versions: list[dict]) -> list[str]:
    """Write each entry's lives. Returns the entries newly eliminated, each announced as entry_eliminated."""
    pk = death.entries_pk(group_id, season)
    entries = table.query(KeyConditionExpression=Key("PK").eq(pk) & Key("SK").begins_with("DEATH#"))["Items"]
    final = {}
    for r in found:
        if r["week"] != len(final) + 1 or r["status"] != FINAL:
            break
        final[r["week"]] = r["teams"]
    out = death.fold({e["entryId"]: {int(w): t for w, t in e["picks"].items()} for e in entries}, final, versions)

    eliminated = []
    for e in entries:
        state = out["entries"][e["entryId"]]
        out_week = state["eliminatedWeek"]
        if e.get("livesLeft") == state["lives"] and e.get("eliminatedWeek") == out_week:
            continue
        if out_week and out_week != e.get("eliminatedWeek"):
            events.emit("entry_eliminated", group_id, season, out_week, f"death#W{out_week:02d}#{e['entryId']}", {
                "entryId": e["entryId"], "ownerSub": e["ownerSub"], "label": e["label"],
            })
            eliminated.append(e["entryId"])
        # A regrade can bring an entry back (an override), so eliminatedWeek is removed as well as set.
        table.update_item(
            Key={"PK": pk, "SK": e["SK"]},
            UpdateExpression="SET livesLeft = :l" + (", eliminatedWeek = :w" if out_week else " REMOVE eliminatedWeek"),
            ExpressionAttributeValues={":l": state["lives"], **({":w": out_week} if out_week else {})},
        )
    return eliminated


def fold(table, group_id: str, season: int, last: int, members: list[dict], versions: list[dict]) -> dict:
    found = week_results(table, group_id, season, last)
    return {
        "standings": fold_standings(table, group_id, season, found, members),
        "eliminated": fold_death(table, group_id, season, found, versions),
    }
