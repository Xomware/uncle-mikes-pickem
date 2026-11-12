import pytest

from lambdas.common.rules import DEFAULTS, new_version, rules_for


def test_no_versions_means_defaults():
    assert rules_for([], 5) == DEFAULTS
    assert DEFAULTS["pickemTie"] == "zero"
    assert DEFAULTS["deathTie"] == "loss"
    assert DEFAULTS["deathSecondLife"] is False


def test_versions_apply_forward_only():
    v1 = new_version([], {"deathSecondLife": True}, 1)
    v2 = new_version([v1], {"pickemTie": "full"}, 6)
    versions = [v1, v2]
    assert rules_for(versions, 5)["pickemTie"] == "zero"
    assert rules_for(versions, 6)["pickemTie"] == "full"
    assert rules_for(versions, 12)["deathSecondLife"] is True
    assert v2["version"] == 2


def test_later_version_wins_for_the_same_week():
    v1 = new_version([], {"deathTie": "win"}, 4)
    v2 = new_version([v1], {"deathTie": "loss"}, 4)
    assert rules_for([v2, v1], 4)["deathTie"] == "loss"


def test_second_life_locked_after_week_one():
    with pytest.raises(ValueError, match="Week 1"):
        new_version([], {"deathSecondLife": True}, 2)
    # Restating the current value is not a change.
    assert new_version([], {"deathSecondLife": False}, 2)["version"] == 1


def test_rejects_unknown_settings():
    with pytest.raises(ValueError):
        new_version([], {"pickemTie": "half"}, 1)
    with pytest.raises(ValueError):
        new_version([], {"fee": 20}, 1)


def test_money_settings_version_like_the_rest():
    v1 = new_version([], {"fees": {"weekly": 10, "yearly": 50, "death": 20}}, 1)
    v2 = new_version([v1], {"payments": [{"method": "venmo", "handle": "@dom"}]}, 3)
    assert rules_for([v1, v2], 2)["payments"] == []
    assert rules_for([v1, v2], 3)["fees"]["yearly"] == 50
    assert rules_for([], 1)["potSplits"] == {"weekly": [100], "yearly": [100], "death": [100]}
