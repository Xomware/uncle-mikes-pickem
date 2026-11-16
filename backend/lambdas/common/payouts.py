"""Who the pots pay, in whole cents. Rules: docs/RULES.md "Money", PLAN.md 10.3.

    GROUP#g#S2027 / PAYOUT#sub#weekly#W05   an organizer marked Week 5's weekly payout sent
    GROUP#g#S2027 / PAYOUT#sub#yearly       ... the season payout
    GROUP#g#S2027 / PAYOUT#sub#death        ... the death pool payout

- Weekly: each week's pot (that week's fees) goes to its winners, top score then the MNF tiebreak.
- Season: the yearly pot by potSplits.yearly and final place. A shared place splits the shares of the
  places it spans, so two tied for 2nd of 60/30/10 take (30 + 10) / 2 each.
- Death: the last entry standing, or an even split among entries alive after Week 18.
Leftover cents go to the first winner by name; for the season pot, the first in first place.
Weekly and death payouts follow the decisions above, so their potSplits aren't read.
"""

from boto3.dynamodb.conditions import Key

from lambdas.common import ledger, nfl_store, season as season_fold
from lambdas.common.death import LAST_WEEK
from lambdas.common.groups import next_unlocked_week
from lambdas.common.rules import rules_for


def mark_sk(sub: str, pot: str, week: int | None = None) -> str:
    return f"PAYOUT#{sub}#{pot}" + (f"#W{week:02d}" if week else "")


def _settle(cents: int, out: dict[str, int], first: str) -> dict[str, int]:
    out[first] += cents - sum(out.values())
    return out


def even(cents: int, people: list[str]) -> dict[str, int]:
    """An even split of `cents`; the first of `people` takes the leftover cents."""
    return _settle(cents, {p: cents // len(people) for p in people}, people[0])


def by_place(cents: int, pcts: list[int], places: list[tuple[str, int]]) -> dict[str, int]:
    """`places` is (who, place) in order, ties sorted by name. Shares of places nobody holds go to first."""
    shares = [cents * p // 100 for p in pcts]
    out = {}
    for place in sorted({p for _, p in places}):
        tied = [who for who, p in places if p == place]
        span = sum(shares[place - 1 : place - 1 + len(tied)])
        out |= {who: span // len(tied) for who in tied}
    return _settle(cents, out, places[0][0])


def weekly_pot(members: list[dict], versions: list[dict], week: int, through: int) -> int:
    """Cents in `week`'s weekly pot. A perSeason fee is spread over the 18 weeks, the odd cents in Week 18."""
    current = rules_for(versions, through + 1)
    if current["feeBasis"] == "perSeason":
        total = current["fees"]["weekly"] * len(members) * 100
        return total // LAST_WEEK + (total % LAST_WEEK if week == LAST_WEEK else 0)
    playing = sum(int(m["joinedWeek"]) <= week for m in members)
    return rules_for(versions, week)["fees"]["weekly"] * playing * 100


def build(members, versions, through, results, standings, entries, marks) -> dict:
    """The payouts view. `results` are RESULT items by week; `standings` the STANDINGS item or None.

    A payout is `final` once its result can't change: a final week, the final season table, a decided death pool.
    """
    names = {m["sub"]: m["name"] for m in members}

    def by_name(sub: str) -> tuple:
        return names[sub].lower(), sub

    sent = {m["SK"]: m for m in marks if m.get("sent")}
    lines = []  # (pot, week, sub, cents, final)

    weeks = []
    for r in results:
        cents = weekly_pot(members, versions, r["week"], through)
        winners = sorted(r["winners"], key=by_name)
        weeks.append({"week": r["week"], "status": r["status"], "pot": cents, "winners": winners})
        if winners and cents:
            lines += [("weekly", r["week"], s, c, r["status"] == "final") for s, c in even(cents, winners).items()]

    season_members = [m for m in members if m["entryType"] == "season"]
    pot = 100 * sum(ledger.owed(m, "yearly", versions, LAST_WEEK) for m in season_members)
    standings = standings or {"rows": [], "final": False, "throughWeek": 0}
    final = standings["final"] and standings["throughWeek"] >= LAST_WEEK
    # STANDINGS written before results.FORMAT 2 can carry "1*" until the next regrade rewrites it.
    places = sorted(
        ((r["member"], int(r["place"].rstrip("*"))) for r in standings["rows"]), key=lambda p: (p[1], *by_name(p[0]))
    )
    if places and pot:
        split = by_place(pot, rules_for(versions, LAST_WEEK)["potSplits"]["yearly"], places)
        lines += [("yearly", None, s, c, final) for s, c in split.items() if c]
    season = {
        "pot": pot,
        "accrued": 100 * sum(ledger.owed(m, "yearly", versions, through) for m in season_members),
        "final": final,
        "throughWeek": standings["throughWeek"],
    }

    alive = sorted(
        (e for e in entries if not e.get("eliminatedWeek")), key=lambda e: (*by_name(e["ownerSub"]), ledger.entry_id(e))
    )
    death_pot = rules_for(versions, through + 1)["fees"]["death"] * len(entries) * 100
    decided = bool(alive) and ((len(alive) == 1 and len(entries) > 1) or final)
    if decided and death_pot:
        owners: dict[str, int] = {}
        for e, c in zip(alive, even(death_pot, [ledger.entry_id(e) for e in alive]).values()):
            owners[e["ownerSub"]] = owners.get(e["ownerSub"], 0) + c
        lines += [("death", None, s, c, True) for s, c in owners.items()]
    death = {
        "pot": death_pot,
        "entries": len(entries),
        "alive": len(alive),
        "decided": decided,
        "winners": [
            {"entryId": ledger.entry_id(e), "label": e.get("label"), "sub": e["ownerSub"]} for e in alive
        ] if decided else [],
    }

    payouts = [
        {"pot": p, "week": w, "sub": s, "name": names[s], "amount": c, "final": f, "sent": mark_sk(s, p, w) in sent}
        for p, w, s, c, f in lines
    ]
    totals = {}

    def total(sub: str) -> dict:
        return totals.setdefault(sub, {"sub": sub, "name": names[sub], "won": 0, "pending": 0, "sent": 0})

    for p in payouts:
        total(p["sub"])["won" if p["final"] else "pending"] += p["amount"]
    # Every sent mark counts, even one a regrade has since moved to someone else: that money still went out.
    for m in sent.values():
        if m["sub"] in names:
            total(m["sub"])["sent"] += m["amount"]
    ranked = sorted(totals.values(), key=lambda t: (-t["won"], -t["pending"], *by_name(t["sub"])))
    return {"weeks": weeks, "season": season, "death": death, "payouts": payouts, "members": ranked}


def load(table, group_id: str, meta: dict, members: list[dict], versions: list[dict]) -> dict:
    """Read what build() needs for the group-season and run it."""
    season = int(meta["season"])
    through = next_unlocked_week(meta) - 1
    pk = ledger.season_pk(group_id, season)
    items = nfl_store.plain(table.query(KeyConditionExpression=Key("PK").eq(pk))["Items"])
    standings = next((i for i in items if i["SK"] == "STANDINGS"), None)
    entries = [i for i in items if i["SK"].startswith("DEATH#")]
    marks = [i for i in items if i["SK"].startswith("PAYOUT#")]
    results = season_fold.week_results(table, group_id, season, through)
    book = build(nfl_store.plain(members), nfl_store.plain(versions), through, results, standings, entries, marks)
    return {"throughWeek": through, **book}
