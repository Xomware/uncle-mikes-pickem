"""Group membership on pickem-app: `GROUP#g` / `MEMBER#sub`, indexed by GSI1 `USER#sub` / `GROUP#g`."""

from datetime import datetime, timezone
from typing import Literal

from lambdas.common.api import ApiError

ORGANIZERS = ("owner", "admin")
EntryType = Literal["weekly", "season"]


def last_locked_week(season: int) -> int | None:
    """Latest week of `season` whose lock has passed. None while the NFL store has no data for it."""
    # Stub until common/nfl_store.py (F3) lands; the swap is this line.
    return None


def next_unlocked_week(season: int) -> int:
    return (last_locked_week(season) or 0) + 1


def member_item(group: dict, sub: str, name: str, role: str, entry_type: str) -> dict:
    gid = group["groupId"]
    return {
        "PK": f"GROUP#{gid}",
        "SK": f"MEMBER#{sub}",
        "GSI1PK": f"USER#{sub}",
        "GSI1SK": f"GROUP#{gid}",
        "sub": sub,
        "name": name,
        "role": role,
        # "weekly" plays for the weekly pot only; "season" plays for weekly and yearly.
        "entryType": entry_type,
        # Denormalized so "my groups" is one GSI query. Groups can't be renamed yet.
        "groupName": group["name"],
        "season": group["season"],
        # The first week this member can pick; earlier weeks grade as missed.
        "joinedWeek": next_unlocked_week(int(group["season"])),
        "joinedAt": datetime.now(timezone.utc).isoformat(),
    }


def membership(table, group_id: str, sub: str) -> dict:
    """The caller's MEMBER item. A non-member gets the same 404 as a missing group."""
    item = table.get_item(Key={"PK": f"GROUP#{group_id}", "SK": f"MEMBER#{sub}"}).get("Item")
    if not item:
        raise ApiError(404, "Group not found")
    return item


def require_organizer(member: dict) -> None:
    if member["role"] not in ORGANIZERS:
        raise ApiError(403, "Only the group's owner or an admin can do that")


def group_summary(member: dict) -> dict:
    """One row of "my groups", built from the caller's MEMBER item."""
    return {
        "groupId": member["GSI1SK"].removeprefix("GROUP#"),
        "name": member["groupName"],
        "season": member["season"],
        "role": member["role"],
    }
