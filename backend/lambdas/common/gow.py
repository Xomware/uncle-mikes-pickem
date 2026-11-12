"""Game of the week: the `GOW` item in a group-week, chosen by an organizer or, failing that, by hype."""

from datetime import datetime, time, timedelta
from zoneinfo import ZoneInfo

ET = ZoneInfo("America/New_York")
TUESDAY = 1


def deadline(lock_at: str) -> datetime:
    """Tuesday 12:00 ET before the lock. After it, cron_tick picks the GOW if nobody has."""
    lock = datetime.fromisoformat(lock_at.replace("Z", "+00:00")).astimezone(ET)
    day = lock.date() - timedelta(days=(lock.weekday() - TUESDAY) % 7)
    due = datetime.combine(day, time(12), ET)
    return due if due < lock else due - timedelta(days=7)


def top_game(games: list[dict]) -> dict:
    """Highest hype score. `games` come in kickoff order and max keeps the first, so the earlier game wins a tie."""
    return max(games, key=lambda g: g.get("hype", {}).get("score", 0))


def item(pk: str, game_id: str, chosen_by: str, now: str) -> dict:
    return {"PK": pk, "SK": "GOW", "gameId": game_id, "chosenBy": chosen_by, "chosenAt": now}


def public(item: dict | None) -> dict | None:
    return item and {k: item[k] for k in ("gameId", "chosenBy", "chosenAt")}
