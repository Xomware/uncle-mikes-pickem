"""Every "now" in the app goes through here so replay groups run on virtual time."""

from datetime import datetime, timezone


def now(group: dict | None = None) -> datetime:
    if group and group.get("clock"):
        return datetime.fromisoformat(group["clock"].replace("Z", "+00:00"))
    return datetime.now(timezone.utc)
