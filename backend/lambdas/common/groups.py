"""Group membership on pickem-app: `GROUP#g` / `MEMBER#sub`, indexed by GSI1 `USER#sub` / `GROUP#g`."""

from datetime import datetime, timezone


def last_locked_week(season: int) -> int | None:
    """Latest week of `season` whose lock has passed. None while the NFL store has no data for it."""
    # Stub until common/nfl_store.py (F3) lands; the swap is this line.
    return None


def next_unlocked_week(season: int) -> int:
    return (last_locked_week(season) or 0) + 1


def member_item(group: dict, sub: str, name: str, role: str) -> dict:
    gid = group["groupId"]
    return {
        "PK": f"GROUP#{gid}",
        "SK": f"MEMBER#{sub}",
        "GSI1PK": f"USER#{sub}",
        "GSI1SK": f"GROUP#{gid}",
        "sub": sub,
        "name": name,
        "role": role,
        # Denormalized so "my groups" is one GSI query. Groups can't be renamed yet.
        "groupName": group["name"],
        "season": group["season"],
        # The first week this member can pick; earlier weeks grade as missed.
        "joinedWeek": next_unlocked_week(int(group["season"])),
        "joinedAt": datetime.now(timezone.utc).isoformat(),
    }


def group_summary(member: dict) -> dict:
    """One row of "my groups", built from the caller's MEMBER item."""
    return {
        "groupId": member["GSI1SK"].removeprefix("GROUP#"),
        "name": member["groupName"],
        "season": member["season"],
        "role": member["role"],
    }
