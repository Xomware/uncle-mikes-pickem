"""Sample contexts for GET /email/preview and the golden snapshots: {sample: (template, context)}.

The recipient's `name` and `group_name` are added by the caller. Shapes match
what common/notices.py builds, which the mail sweep tests render for real.
"""

GRID = [
    ("BUF @ MIA", "24-27", "MIA", 16, "right", False),
    ("KC @ BAL", "20-17", "BAL", 15, "wrong", True),
    ("DAL @ PHI", "13-31", "PHI", 14, "right", False),
    ("GB @ CHI", "21-21", "GB", 13, "tie", False),
    ("SF @ SEA", "", None, None, "void", False),
    ("NYJ @ NE", "10-6", "NYJ", 12, "right", False),
    ("DET @ MIN", "28-24", "MIN", 11, "wrong", False),
    ("LAR @ ARI", "30-20", "LAR", 10, "right", False),
]

WEEK = {
    "group_id": "g-sample",
    "week": 5,
    "won": False,
    "missed": False,
    "score": 63,
    "place": "tied 3rd",
    "entrants": 14,
    "winners": [{"name": "Sam", "tiebreak": 44}],
    "winning_score": 81,
    "tiebreak_total": 47,
    "grid": [
        {"matchup": m, "score": s, "team": t, "conf": c, "status": st, "gow": gow}
        for m, s, t, c, st, gow in GRID
    ],
    "gow": {"matchup": "KC @ BAL", "score": "20-17", "team": "BAL", "conf": 15, "winner": "KC", "points": -15},
    "season": {"place": "5th", "total": 412, "gow": 22, "of": 12},
    "correction": False,
    "previous": [],
}

DEATH = {"group_id": "g-sample", "week": 7, "label": "Pat 2", "team": "DAL", "outcome": "lost", "lives_left": 1, "alive": 9}

SAMPLES: dict[str, tuple[str, dict]] = {
    "test": ("test", {}),
    "week_result": ("week_result", WEEK),
    "week_won": ("week_result", {
        **WEEK, "won": True, "score": 81, "place": "1st", "winners": [{"name": "You", "tiebreak": 44}],
        "season": None,
    }),
    "week_correction": ("week_result", {
        **WEEK, "won": True, "score": 81, "place": "1st", "winners": [{"name": "You", "tiebreak": 44}],
        "correction": True, "previous": ["Sam"],
    }),
    "gow_set": ("gow_set", {
        "group_id": "g-sample", "week": 6, "matchup": "KC @ BUF", "when": "Sun 8:20 PM ET", "chosen_by": "Dom",
        "lock": "Thu 8:15 PM ET",
    }),
    "gow_set_auto": ("gow_set", {
        "group_id": "g-sample", "week": 6, "matchup": "KC @ BUF", "when": "Sun 8:20 PM ET", "chosen_by": None,
        "lock": "Thu 8:15 PM ET",
    }),
    "death_out": ("death_out", {**DEATH, "lives_left": 0}),
    "death_out_missed": ("death_out", {**DEATH, "team": None, "outcome": "", "lives_left": 0}),
    "death_life": ("death_life", DEATH),
    "reminder_24": ("reminder", {
        "group_id": "g-sample", "week": 5, "hours": 24, "lock": "Thu 8:15 PM ET", "picks": "none", "entries": [],
    }),
    "reminder_2": ("reminder", {
        "group_id": "g-sample", "week": 5, "hours": 2, "lock": "Thu 8:15 PM ET", "picks": "draft",
        "entries": [{"label": "Pat 1", "last_life": False}, {"label": "Pat 2", "last_life": True}],
    }),
    "gow_admin": ("gow_admin", {
        "group_id": "g-sample", "week": 6, "deadline": "Tue 12:00 PM ET", "count": 15,
        "games": [
            {"matchup": "KC @ BUF", "when": "Sun 8:20 PM ET", "hype": 71.5,
             "why": ["Standalone slot", "Spread 1.5", "O/U 51.5"], "token": "sample-token-1"},
            {"matchup": "DAL @ PHI", "when": "Sun 4:25 PM ET", "hype": 58, "why": ["Division game", "Spread 3"], "token": "sample-token-2"},
            {"matchup": "DET @ GB", "when": "Thu 8:15 PM ET", "hype": 55.2,
             "why": ["Standalone slot", "Division game", "Spread 6.5"], "token": "sample-token-3"},
        ],
    }),
    "death_revived": ("death_revived", {"group_id": "g-sample", "week": 7, "labels": ["Pat 1", "Pat 2"], "alive": 5}),
}
