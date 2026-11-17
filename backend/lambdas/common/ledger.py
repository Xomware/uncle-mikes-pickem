"""Payments ledger. Rules: docs/RULES.md "Money". The app records payments the organizer marks; it never moves money.

Fees are whole dollars. Under feeBasis "perWeek" (the default, from Uncle Mike's "$1 WEEKLY / $2 YEARLY" sheet)
a weekly member owes the weekly fee for every week from joinedWeek through the latest locked week, and a season
member owes weekly + yearly for each of those weeks, each week priced by the rules in force for it. "perSeason"
charges each fee once, at today's rate. Each death entry owes the death fee once.

Owed is computed, not stored. A `PAY#` item records the running total paid toward one fee, so a fee that grows
each week is settled by re-marking it with the new total.
"""

from lambdas.common.rules import rules_for

KINDS = ("weekly", "yearly", "death")


def season_pk(group_id: str, season: int) -> str:
    return f"GROUP#{group_id}#S{season}"


def pay_sk(sub: str, kind: str, entry_id: str | None = None) -> str:
    return f"PAY#{sub}#{kind}" + (f"#{entry_id}" if entry_id else "")


def entry_id(entry: dict) -> str:
    return entry["SK"].removeprefix("DEATH#")


def owed(member: dict, kind: str, versions: list[dict], through: int) -> int:
    """Dollars `member` owes toward the weekly or yearly fee for Weeks 1..`through`."""
    current = rules_for(versions, through + 1)
    if current["feeBasis"] == "perSeason":
        return current["fees"][kind]
    return sum(rules_for(versions, w)["fees"][kind] for w in range(int(member["joinedWeek"]), through + 1))


def dues(member: dict, entries: list[dict], versions: list[dict], through: int) -> list[dict]:
    """One line per fee. A fee that is zero now and owes nothing isn't listed."""
    fees = rules_for(versions, through + 1)["fees"]
    kinds = ("weekly", "yearly") if member["entryType"] == "season" else ("weekly",)
    lines = [{"kind": k, "owed": owed(member, k, versions, through)} for k in kinds]
    lines += [
        {"kind": "death", "entryId": entry_id(e), "label": e.get("label"), "owed": fees["death"]}
        for e in entries
        if e.get("ownerSub") == member["sub"]
    ]
    return [line for line in lines if line["owed"] > 0 or fees[line["kind"]] > 0]


def build(members: list[dict], entries: list[dict], pays: list[dict], versions: list[dict], through: int) -> dict:
    """Per-member lines with paid status and balances, and each pot's size, collected total and payouts by place."""
    rules = rules_for(versions, through + 1)
    marked = {p["SK"]: p for p in pays if p.get("paid")}
    rows = []
    for m in members:
        lines = []
        for line in dues(m, entries, versions, through):
            pay = marked.get(pay_sk(m["sub"], line["kind"], line.get("entryId")))
            paid = {k: pay[k] for k in ("amount", "method", "paidOn")} if pay else {}
            lines.append({**line, "paid": bool(pay) and pay["amount"] >= line["owed"], **paid})
        owes = sum(line["owed"] for line in lines)
        paid = sum(line.get("amount", 0) for line in lines)
        rows.append(
            {
                "sub": m["sub"],
                "name": m["name"],
                "entryType": m["entryType"],
                "lines": lines,
                "owed": owes,
                "paid": paid,
                "balance": owes - paid,
            }
        )

    season = [m for m in members if m["entryType"] == "season"]
    totals = {
        "weekly": sum(owed(m, "weekly", versions, through) for m in members),
        "yearly": sum(owed(m, "yearly", versions, through) for m in season),
        "death": rules["fees"]["death"] * len(entries),
    }
    entrants = {"weekly": len(members), "yearly": len(season), "death": len(entries)}
    pots = {}
    for pot in KINDS:
        pots[pot] = {
            "entries": entrants[pot],
            "total": totals[pot],
            "collected": sum(line.get("amount", 0) for r in rows for line in r["lines"] if line["kind"] == pot),
            # Whole cents; a 33% place of an odd pot can be fractional. Paying out the remainder is the organizer's call.
            "payouts": [round(totals[pot] * pct / 100, 2) for pct in rules["potSplits"][pot]],
        }
    return {"members": rows, "pots": pots, "owedThrough": through, "feeBasis": rules["feeBasis"]}
