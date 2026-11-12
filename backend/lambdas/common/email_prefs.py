"""Email preferences, stored per group on the MEMBER item as `emailPrefs`: {type: bool}.

Every type is on until turned off, so a missing key reads as on. Every email
carries a one-tap unsubscribe for its own type and for all of that group's email.
"""

# The labels are the profile toggles' wording, reused on the unsubscribe page.
TYPES = {
    "results": "Weekly results and winners",
    "reminders": "Reminders before picks lock",
    "death": "Death pool lives lost and eliminations",
    "gowAdmin": "Game of the Week selection (owners and admins)",
}
# What an unsubscribe link can turn off: one type, or all of a group's email.
SCOPES = {*TYPES, "all"}


def with_defaults(stored: dict | None) -> dict[str, bool]:
    stored = stored or {}
    return {t: bool(stored.get(t, True)) for t in TYPES}


def covered(scope: str) -> list[str]:
    return list(TYPES) if scope == "all" else [scope]


def describe(scope: str) -> str:
    return "all email from this group" if scope == "all" else f"“{TYPES[scope]}” emails"
