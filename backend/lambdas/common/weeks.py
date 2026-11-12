"""A group's week: the `GROUP#g#S<yr>#W<nn>` partition (PICK#sub, GOW, CANCELED) and its lock."""

from lambdas.common import clock, nfl_store
from lambdas.common.api import ApiError
from lambdas.common.groups import membership


def week_pk(group_id: str, season: int, week: int) -> str:
    return f"GROUP#{group_id}#S{season}#W{week:02d}"


def load(table, group_id: str, sub: str, week: int) -> tuple[dict, dict, dict]:
    """(group META, caller's MEMBER, the NFL WEEK). 404 for non-members and unscheduled weeks."""
    member = membership(table, group_id, sub)
    group = table.get_item(Key={"PK": f"GROUP#{group_id}", "SK": "META"})["Item"]
    nfl_week = nfl_store.get_week(int(group["season"]), week)
    if not nfl_week:
        raise ApiError(404, f"Week {week} isn't on the schedule yet")
    return group, member, nfl_week


def canceled_ids(table, pk: str) -> set[str]:
    """Games the organizer voided for this group-week (POST /games/cancel)."""
    item = table.get_item(Key={"PK": pk, "SK": "CANCELED"}).get("Item")
    return set(item["gameIds"]) if item else set()


def open_games(table, pk: str, season: int, week: int) -> list[dict]:
    canceled = canceled_ids(table, pk)
    return [g for g in nfl_store.list_games(season, week) if g["gameId"] not in canceled]


def locked(group: dict, nfl_week: dict) -> bool:
    # Read from the WEEK item on every call: a flex can move the first kickoff until it passes.
    return nfl_store.iso(clock.now(group)) >= nfl_week["lockAt"]


def require_unlocked(group: dict, nfl_week: dict) -> None:
    if locked(group, nfl_week):
        raise ApiError(409, f"Week {nfl_week['week']} locked at kickoff of its first game")
