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
}

SAMPLES: dict[str, tuple[str, dict]] = {
    "test": ("test", {}),
    "week_result": ("week_result", WEEK),
    "week_won": ("week_result", {
        **WEEK, "won": True, "score": 81, "place": "1st", "winners": [{"name": "You", "tiebreak": 44}],
        "season": None,
    }),
}
