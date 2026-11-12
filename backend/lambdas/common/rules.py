"""Organizer settings. Defaults are docs/RULES.md "Organizer settings".

Each change is a `RULES#S<yr>#v<n>` item carrying `version` and `effectiveWeek`;
a version applies from its effectiveWeek on and never to earlier weeks, so a
regrade can't rescore a week under rules that weren't in force for it.
"""

from __future__ import annotations

DEFAULTS = {
    "pickemTie": "zero",
    "deathTie": "loss",
    "deathSecondLife": False,
    "lock": "firstKickoff",
}

CHOICES = {
    "pickemTie": {"zero", "full"},
    "deathTie": {"loss", "win"},
    "deathSecondLife": {True, False},
    "lock": {"firstKickoff"},
}


def rules_for(versions: list[dict], week: int) -> dict:
    """Settings in force for `week`: the newest version whose effectiveWeek <= week."""
    live = [v for v in versions if v["effectiveWeek"] <= week]
    if not live:
        return dict(DEFAULTS)
    latest = max(live, key=lambda v: (v["effectiveWeek"], v["version"]))
    return {**DEFAULTS, **{k: latest[k] for k in DEFAULTS if k in latest}}


def new_version(versions: list[dict], changes: dict, effective_week: int) -> dict:
    """The next RULES item for `changes`, taking effect at `effective_week` (the next unlocked week)."""
    for key, value in changes.items():
        if key not in CHOICES or value not in CHOICES[key]:
            raise ValueError(f"invalid setting {key}={value!r}")
    current = rules_for(versions, effective_week)
    flips_life = changes.get("deathSecondLife", current["deathSecondLife"]) != current["deathSecondLife"]
    if flips_life and effective_week > 1:
        raise ValueError("deathSecondLife can only change before the Week 1 lock")
    return {
        **current,
        **changes,
        "version": max((v["version"] for v in versions), default=0) + 1,
        "effectiveWeek": effective_week,
    }
