"""Feature flags on pickem-app: global at `CONFIG` / `FLAGS`, per group at `GROUP#g` / `FLAGS`.

Each item holds `flags: {name: value}`. A value resolves group override, then
global, then the default below. Read once per invocation and never across
invocations, so a flip from the super admin portal lands on the next request.
"""

import os

import boto3

from lambdas.common import api
from lambdas.common.api import ApiError

# Every default matches how the app behaved before flags, so the first deploy changes nothing.
DEFAULTS: dict[str, bool | str] = {
    "deathPool": True,
    "payments": True,
    "gameInfo": True,
    "filmRoom": True,
    "analytics": True,
    "payouts": True,
    "printableSheets": True,
    "replayGroups": True,
    "groupCreation": True,
    "emailResults": True,
    "emailReminders": True,
    "emailDeath": True,
    "emailGowAdmin": True,
    "emailAnnouncements": True,
    "maintenanceBanner": "",
}

LABELS = {
    "deathPool": "The death pool",
    "payments": "Payments",
    "gameInfo": "Game info",
    "filmRoom": "Film room",
    "analytics": "Analytics",
    "payouts": "Payouts",
    "replayGroups": "Replay groups",
}

GLOBAL = {"PK": "CONFIG", "SK": "FLAGS"}

_cache: dict[str | None, dict] = {}

def key(group_id: str | None) -> dict:
    return {"PK": f"GROUP#{group_id}", "SK": "FLAGS"} if group_id else GLOBAL

def overrides(group_id: str | None) -> dict:
    """The raw `flags` map stored at one scope, {} when there is none."""
    if group_id not in _cache:
        item = boto3.resource("dynamodb").Table(os.environ["APP_TABLE"]).get_item(Key=key(group_id)).get("Item")
        _cache[group_id] = (item or {}).get("flags") or {}
    return _cache[group_id]

def resolved(group_id: str | None = None) -> dict:
    out = dict(DEFAULTS)
    for scope in [None, group_id] if group_id else [None]:
        # A name dropped from DEFAULTS can linger in a stored map; it no longer means anything.
        out |= {k: v for k, v in overrides(scope).items() if k in DEFAULTS}
    return out

def enabled(name: str, group_id: str | None = None) -> bool:
    return bool(resolved(group_id)[name])

def require(name: str, group_id: str | None = None) -> None:
    if not enabled(name, group_id):
        raise ApiError(404, f"{LABELS[name]} is turned off")

def reset() -> None:
    """Drop what the last invocation read. api_handler calls it; mail_sweep calls it itself."""
    _cache.clear()

api.INVOCATION_CACHES.append(reset)
