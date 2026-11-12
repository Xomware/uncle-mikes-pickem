"""Payments ledger. Rules: docs/RULES.md "Money". The app records payments the organizer marks; it never moves money.

Fees are one-off season amounts in whole dollars. Weekly-entry members owe the weekly fee, season members
owe weekly + yearly, and each death entry owes the death fee. Owed is computed from the settings in force,
not stored, so a fee change re-prices every balance; `PAY#` items only record what was paid.
"""

KINDS = ("weekly", "yearly", "death")


def season_pk(group_id: str, season: int) -> str:
    return f"GROUP#{group_id}#S{season}"


def pay_sk(sub: str, kind: str, entry_id: str | None = None) -> str:
    return f"PAY#{sub}#{kind}" + (f"#{entry_id}" if entry_id else "")


def entry_id(entry: dict) -> str:
    return entry["SK"].removeprefix("DEATH#")


def dues(member: dict, entries: list[dict], fees: dict) -> list[dict]:
    """What one member owes, one line per fee. A zero fee owes nothing and isn't listed."""
    lines = [{"kind": "weekly", "owed": fees["weekly"]}]
    if member["entryType"] == "season":
        lines.append({"kind": "yearly", "owed": fees["yearly"]})
    lines += [
        {"kind": "death", "entryId": entry_id(e), "label": e.get("label"), "owed": fees["death"]}
        for e in entries
        if e.get("ownerSub") == member["sub"]
    ]
    return [line for line in lines if line["owed"] > 0]


def build(members: list[dict], entries: list[dict], pays: list[dict], rules: dict) -> dict:
    """Per-member lines with paid status and balances, and each pot's size, collected total and payouts by place."""
    marked = {p["SK"]: p for p in pays if p.get("paid")}
    rows = []
    for m in members:
        lines = []
        for line in dues(m, entries, rules["fees"]):
            pay = marked.get(pay_sk(m["sub"], line["kind"], line.get("entryId")))
            paid = {k: pay[k] for k in ("amount", "method", "paidOn")} if pay else {}
            lines.append({**line, "paid": bool(pay), **paid})
        owed = sum(line["owed"] for line in lines)
        paid = sum(line.get("amount", 0) for line in lines)
        rows.append(
            {
                "sub": m["sub"],
                "name": m["name"],
                "entryType": m["entryType"],
                "lines": lines,
                "owed": owed,
                "paid": paid,
                "balance": owed - paid,
            }
        )

    entrants = {
        "weekly": len(members),
        "yearly": sum(m["entryType"] == "season" for m in members),
        "death": len(entries),
    }
    pots = {}
    for pot in KINDS:
        total = rules["fees"][pot] * entrants[pot]
        pots[pot] = {
            "entries": entrants[pot],
            "total": total,
            "collected": sum(line.get("amount", 0) for r in rows for line in r["lines"] if line["kind"] == pot),
            # Whole cents; a 33% place of an odd pot can be fractional. Paying out the remainder is the organizer's call.
            "payouts": [round(total * pct / 100, 2) for pct in rules["potSplits"][pot]],
        }
    return {"members": rows, "pots": pots}
