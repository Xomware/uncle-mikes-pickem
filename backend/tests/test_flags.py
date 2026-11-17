import pytest

from lambdas.common import flags, superadmin
from tests.conftest import BOSS, DOM, PAT, call, table


def set_flags(group_id, values):
    table().put_item(Item={**flags.key(group_id), "flags": values})


def test_resolves_group_then_global_then_default(app):
    set_flags(None, {"payments": False, "deathPool": False, "retired": True})
    set_flags("g", {"payments": True})
    flags.reset()
    out = flags.resolved("g")
    assert (out["payments"], out["deathPool"], out["gameInfo"]) == (True, False, True)
    assert "retired" not in out
    assert flags.enabled("payments") is False
    assert set(flags.resolved()) == set(flags.DEFAULTS)


def test_config_flags_returns_resolved_flags_to_any_signed_in_user(app):
    module = app("config_flags")
    set_flags(None, {"maintenanceBanner": "Down at 9"})
    set_flags("g", {"deathPool": False})
    status, data = call(module, PAT, query={"groupId": "g"})
    assert status == 200
    assert (data["maintenanceBanner"], data["deathPool"], data["payments"]) == ("Down at 9", False, True)
    assert call(module, PAT)[1]["deathPool"] is True
    assert call(module, {})[0] == 401


def test_a_flip_lands_on_the_next_invocation(app):
    module = app("config_flags")
    assert call(module, PAT)[1]["payments"] is True
    set_flags(None, {"payments": False})
    assert call(module, PAT)[1]["payments"] is False


@pytest.mark.parametrize(
    "name, handler, body, query",
    [
        ("deathPool", "death_board", None, {"id": "g"}),
        ("deathPool", "death_entry", {"groupId": "g"}, None),
        ("deathPool", "death_pick", {"groupId": "g", "entryId": "e", "week": 1, "team": "KC"}, None),
        ("payments", "payments_ledger", None, {"id": "g"}),
        ("payments", "payments_mark", {"groupId": "g", "sub": "u", "kind": "weekly", "paid": False}, None),
        ("gameInfo", "games_info", None, {"groupId": "g", "gameId": "1"}),
        ("analytics", "analytics_week", None, {"groupId": "g", "week": "1"}),
        ("analytics", "analytics_season", None, {"id": "g"}),
        ("payouts", "payments_payouts", None, {"id": "g"}),
        ("payouts", "payments_payout_mark", {"groupId": "g", "sub": "u", "pot": "yearly", "sent": False}, None),
    ],
)
def test_disabled_flag_404s_its_endpoints(app, name, handler, body, query):
    set_flags("g", {name: False})
    assert call(app(handler), DOM, body, query) == (404, f"{flags.LABELS[name]} is turned off")


def test_group_creation_off_leaves_only_the_super_admin(app, boss):
    module = app("groups_create")
    set_flags(None, {"groupCreation": False})
    assert call(module, DOM, {"name": "Pool", "season": 2027}) == (404, "Group creation is turned off")
    assert call(module, BOSS, {"name": "Pool", "season": 2027})[0] == 201


def test_replay_groups_off_blocks_replay_creation(app):
    set_flags(None, {"replayGroups": False})
    body = {"name": "R", "season": 2026, "replay": True}
    assert call(app("groups_create"), DOM, body) == (404, "Replay groups is turned off")


def test_super_admin_is_the_verified_email_on_the_list(app, boss):
    def event(claims):
        return {"requestContext": {"authorizer": {"claims": claims}}}

    assert superadmin.is_super(event(BOSS))
    assert superadmin.is_super(event({**BOSS, "email_verified": "true"}))
    assert not superadmin.is_super(event({**BOSS, "email_verified": "false"}))
    assert not superadmin.is_super(event(DOM))
    assert not superadmin.is_super(event({"email": "boss@example.com"}))
    # Only the authorizer's claims count; a flag the client sends is never read.
    assert not superadmin.is_super({**event(DOM), "headers": {"x-super-admin": "true"}, "body": '{"superAdmin": true}'})
