"""A game's home win probability from its stored line (GAME `lines`, ESPN's sign convention).

The line is the closing one: cron_tick stops writing it at kickoff, and live state
(score, clock) is ignored. Ties (~0.3% of NFL games) are ignored too.
"""

from __future__ import annotations

from statistics import NormalDist

# The SD of an NFL final margin around the closing spread. Stern (1991) measured 13.86
# over 1981-84; ~13.5 is the figure for the modern game. Only used when there's no moneyline.
MARGIN_SIGMA = 13.5


def implied(american: int) -> float:
    """The raw (vigged) probability an American price implies: -150 is 0.6, +130 is 0.435."""
    return 100 / (american + 100) if american > 0 else -american / (100 - american)


def home_win(lines: dict | None) -> tuple[float, str]:
    """(P(home wins), source). Moneyline de-vigged by normalising the pair to 1, else the
    spread through a normal margin, else a coin flip."""
    lines = lines or {}
    home, away = lines.get("homeMoneyline"), lines.get("awayMoneyline")
    if home is not None and away is not None:
        h, a = implied(home), implied(away)
        return h / (h + a), "moneyline"
    spread = lines.get("spread")
    if spread is not None:
        # The home line: -3 means home by 3, so the margin is centred on -spread.
        return NormalDist().cdf(-spread / MARGIN_SIGMA), "spread"
    return 0.5, "even"
