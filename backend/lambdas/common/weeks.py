"""A group's week: the `GROUP#g#S<yr>#W<nn>` partition (PICK#sub, GOW, CANCELED) and its lock.

Weeks, games and lock times come from the group's feed (nfl_store.for_group), so a
replay group reads the REPLAY rows on its virtual clock.
"""

from lambdas.common import nfl_store
from lambdas.common.api import ApiError
from lambdas.common.groups import membership


def week_pk(group_id: str, season: int, week: int) -> str:
    return f"GROUP#{group_id}#S{season}#W{week:02d}"


def load(table, group_id: str, sub: str, week: int) -> tuple[dict, dict, nfl_store.Feed, dict]:
    """(group META, caller's MEMBER, the group's feed, the WEEK). 404 for non-members and unscheduled weeks."""
    member = membership(table, group_id, sub)
    group = table.get_item(Key={"PK": f"GROUP#{group_id}", "SK": "META"})["Item"]
    feed = nfl_store.for_group(group)
    nfl_week = feed.week(week)
    if not nfl_week:
        raise ApiError(404, f"Week {week} isn't on the schedule yet")
    return group, member, feed, nfl_week


def require_unlocked(feed: nfl_store.Feed, nfl_week: dict) -> None:
    # nfl_week is read fresh on every call: a flex can move the first kickoff until it passes.
    if feed.locked(nfl_week):
        raise ApiError(409, f"Week {nfl_week['week']} locked at kickoff of its first game")
