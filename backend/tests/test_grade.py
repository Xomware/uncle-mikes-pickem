import pytest

from lambdas.common.grade import CANCELED, TIE, grade, validate_sheet
from lambdas.common.rules import DEFAULTS

GAMES = {"g1": ("KC", "BUF"), "g2": ("DAL", "NYG"), "g3": ("GB", "CHI")}


def sheet(**picks):
    return {gid: {"team": team, "conf": conf} for gid, (team, conf) in picks.items()}


def test_valid_sheet_passes():
    validate_sheet(sheet(g1=("KC", 3), g2=("NYG", 1), g3=("GB", 2)), GAMES, set())


@pytest.mark.parametrize(
    "picks",
    [
        sheet(g1=("KC", 3), g2=("NYG", 1)),  # a game unpicked
        sheet(g1=("KC", 3), g2=("NYG", 3), g3=("GB", 2)),  # duplicate confidence
        sheet(g1=("KC", 4), g2=("NYG", 1), g3=("GB", 2)),  # above N
        sheet(g1=("KC", 0), g2=("NYG", 1), g3=("GB", 2)),  # below 1
        sheet(g1=("SEA", 3), g2=("NYG", 1), g3=("GB", 2)),  # team not in the game
    ],
)
def test_invalid_sheets_rejected(picks):
    with pytest.raises(ValueError):
        validate_sheet(picks, GAMES, set())


def test_canceled_game_lowers_n():
    validate_sheet(sheet(g1=("KC", 2), g2=("NYG", 1)), GAMES, {"g3"})
    with pytest.raises(ValueError):
        validate_sheet(sheet(g1=("KC", 3), g2=("NYG", 1)), GAMES, {"g3"})
    with pytest.raises(ValueError):
        validate_sheet(sheet(g1=("KC", 2), g2=("NYG", 1), g3=("GB", 3)), GAMES, {"g3"})


def test_gow_right_counts_double_on_yearly():
    # RULES.md: 15 confidence gives 15 weekly and 30 yearly.
    picks = {f"g{i}": {"team": "A", "conf": i} for i in range(1, 16)}
    results = {gid: "B" for gid in picks} | {"g15": "A"}
    out = grade(picks, results, "g15", DEFAULTS)
    assert (out["weekly"], out["yearly"], out["gow"]) == (15, 30, 15)


def test_gow_wrong_counts_negative_on_yearly():
    # RULES.md: 15 confidence gives 0 weekly and -15 yearly.
    picks = {f"g{i}": {"team": "A", "conf": i} for i in range(1, 16)}
    results = {gid: "B" for gid in picks}
    out = grade(picks, results, "g15", DEFAULTS)
    assert (out["weekly"], out["yearly"], out["gow"]) == (0, -15, -15)


def test_per_game_statuses():
    picks = sheet(g1=("KC", 3), g2=("NYG", 1), g3=("GB", 2))
    out = grade(picks, {"g1": "KC", "g2": "DAL"}, "g1", DEFAULTS)
    assert out["games"] == {"g1": "right", "g2": "wrong", "g3": "pending"}
    assert (out["weekly"], out["yearly"], out["gow"]) == (3, 6, 3)


def test_tie_scores_zero_by_default_and_gow_tie_is_not_negative():
    picks = sheet(g1=("KC", 3), g2=("NYG", 1), g3=("GB", 2))
    out = grade(picks, {"g1": TIE, "g2": "NYG", "g3": "CHI"}, "g1", DEFAULTS)
    assert out["games"]["g1"] == "tie"
    assert (out["weekly"], out["yearly"], out["gow"]) == (1, 1, 0)


def test_tie_full_setting_pays_everyone():
    picks = sheet(g1=("KC", 3), g2=("NYG", 1), g3=("GB", 2))
    out = grade(picks, {"g1": TIE, "g2": "DAL", "g3": "CHI"}, "g1", DEFAULTS | {"pickemTie": "full"})
    assert (out["weekly"], out["yearly"], out["gow"]) == (3, 6, 3)


def test_game_canceled_after_lock_is_void_and_not_reranked():
    picks = sheet(g1=("KC", 3), g2=("NYG", 1), g3=("GB", 2))
    out = grade(picks, {"g1": CANCELED, "g2": "NYG", "g3": "GB"}, "g1", DEFAULTS)
    assert out["games"]["g1"] == "void"
    assert (out["weekly"], out["yearly"], out["gow"]) == (3, 3, 0)
