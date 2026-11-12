"""Death pool (survivor) fold. Rules: docs/RULES.md "Death pool".

entries: {entryId: {week: team}}
results: {week: {team: "W" | "L" | "T"}} for completed weeks only. A picked team
         missing from its week (canceled game) costs no life.
"""

from __future__ import annotations

from lambdas.common.rules import rules_for

LAST_WEEK = 18


def check_pick(picks: dict[int, str], week: int, team: str) -> None:
    if any(t == team for w, t in picks.items() if w != week):
        raise ValueError(f"{team} already used this season")


def _hit(team: str | None, outcomes: dict[str, str], tie_loses: bool) -> bool:
    if team is None:
        return True
    result = outcomes.get(team)
    return result == "L" or (result == "T" and tie_loses)


def fold(entries: dict[str, dict[int, str]], results: dict[int, dict[str, str]], versions: list[dict]) -> dict:
    # Second life can only be set before Week 1, so Week 1's rules decide it for the season.
    lives = 2 if rules_for(versions, 1)["deathSecondLife"] else 1
    state = {e: {"lives": lives, "eliminatedWeek": None} for e in entries}
    last = 0
    for week in sorted(results):
        alive = [e for e in state if state[e]["eliminatedWeek"] is None]
        if len(alive) <= 1:
            break
        last = week
        tie_loses = rules_for(versions, week)["deathTie"] == "loss"
        hit = [e for e in alive if _hit(entries[e].get(week), results[week], tie_loses)]
        # Everyone left went down together while on their last life: they all come back.
        # If anyone still had a spare life, spares are spent and last lives are lost as usual.
        if len(hit) == len(alive) and all(state[e]["lives"] == 1 for e in alive):
            continue
        for e in hit:
            state[e]["lives"] -= 1
            if state[e]["lives"] == 0:
                state[e]["eliminatedWeek"] = week
    alive = [e for e in state if state[e]["eliminatedWeek"] is None]
    done = len(alive) == 1 or last >= LAST_WEEK
    return {"entries": state, "winners": sorted(alive) if done else []}
