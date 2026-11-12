"""Weekly and season standings. Rules: docs/RULES.md, plus PLAN.md "Decisions taken"."""

from __future__ import annotations

from collections.abc import Iterable


def fill_missed(scores: dict[str, int | None]) -> dict[str, int]:
    """None means no pick sheet: score the lowest submitter minus 1, or 0 if nobody submitted."""
    submitted = [s for s in scores.values() if s is not None]
    missed = min(submitted) - 1 if submitted else 0
    return {m: missed if s is None else s for m, s in scores.items()}


def places(scores: dict[str, int | tuple]) -> dict[str, str]:
    """Competition ranking (1, 1, 3); a shared place prints as "1*"."""
    values = sorted(scores.values(), reverse=True)
    out = {}
    for member, score in scores.items():
        place = values.index(score) + 1
        out[member] = f"{place}*" if values.count(score) > 1 else str(place)
    return out


def week_board(graded: dict[str, dict], members: Iterable[str]) -> dict[str, dict]:
    """Every current member gets a row. Anyone without a graded sheet, including a late
    joiner for weeks before they joined, gets the missed score on both boards."""
    members = list(members)
    weekly = fill_missed({m: graded[m]["weekly"] if m in graded else None for m in members})
    yearly = fill_missed({m: graded[m]["yearly"] if m in graded else None for m in members})
    place = places(weekly)
    return {
        m: {
            "weekly": weekly[m],
            "yearly": yearly[m],
            "gow": graded[m]["gow"] if m in graded else 0,
            "missed": m not in graded,
            "place": place[m],
        }
        for m in members
    }


def weekly_winners(weekly: dict[str, int], guesses: dict[str, int], actual_total: int) -> list[str]:
    """Payout winners: top weekly score among submitters, then closest tiebreak guess.
    An exact tie on the guess splits, so this can return several."""
    if not guesses:
        return []
    best = max(weekly[m] for m in guesses)
    top = [m for m in guesses if weekly[m] == best]
    closest = min(abs(guesses[m] - actual_total) for m in top)
    return sorted(m for m in top if abs(guesses[m] - actual_total) == closest)


def season(boards: Iterable[dict[str, dict]]) -> list[dict]:
    """Sum yearly week scores; total GOW points break a tie on the total."""
    totals: dict[str, list[int]] = {}
    for board in boards:
        for member, row in board.items():
            t = totals.setdefault(member, [0, 0])
            t[0] += row["yearly"]
            t[1] += row["gow"]
    place = places({m: (t[0], t[1]) for m, t in totals.items()})
    rows = [{"member": m, "total": t[0], "gow": t[1], "place": place[m]} for m, t in totals.items()]
    return sorted(rows, key=lambda r: (-r["total"], -r["gow"], r["member"]))
