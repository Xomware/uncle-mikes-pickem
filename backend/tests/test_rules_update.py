import pytest

from lambdas.common import groups
from tests.conftest import DOM, PAT, SAM, call, table

FEES = {"weekly": 10, "yearly": 100, "death": 20}
SPLITS = {"weekly": [100], "yearly": [60, 30, 10], "death": [100]}


@pytest.fixture
def api(app):
    names = ("groups_create", "groups_get", "invites_create", "invites_accept", "rules_update", "members_update")
    return {name: app(name) for name in names}


@pytest.fixture
def gid(api):
    gid = call(api["groups_create"], DOM, {"name": "Pool", "season": 2027})[1]["groupId"]
    code = call(api["invites_create"], DOM, {"groupId": gid})[1]["code"]
    call(api["invites_accept"], PAT, {"code": code, "entryType": "weekly"})
    return gid


def update(api, gid, changes, who=DOM):
    return call(api["rules_update"], who, {"groupId": gid, "changes": changes})


def test_update_writes_a_new_version_the_group_read_returns(api, gid):
    status, data = update(api, gid, {"fees": FEES, "potSplits": SPLITS, "deathSecondLife": True})
    assert status == 200
    assert (data["version"], data["effectiveWeek"]) == (1, 1)

    status, data = update(api, gid, {"payments": [{"method": "venmo", "handle": " @dom "}], "pickemTie": "full"})
    assert data["version"] == 2

    rules = call(api["groups_get"], PAT, query={"id": gid})[1]
    assert rules["rulesVersion"] == 2
    assert rules["rules"]["fees"] == FEES
    assert rules["rules"]["potSplits"]["yearly"] == [60, 30, 10]
    assert rules["rules"]["payments"] == [{"method": "venmo", "handle": "@dom"}]
    assert rules["rules"]["deathSecondLife"] is True
    item = table().get_item(Key={"PK": f"GROUP#{gid}", "SK": "RULES#S2027#v2"})["Item"]
    assert item["changedBy"] == "u-dom"
    assert item["effectiveWeek"] == 1


def test_takes_effect_from_the_next_unlocked_week(api, gid, monkeypatch):
    monkeypatch.setattr(groups, "last_locked_week", lambda season: 4)
    assert update(api, gid, {"pickemTie": "full"})[1]["effectiveWeek"] == 5


def test_second_life_cannot_change_after_week_one_locks(api, gid, monkeypatch):
    monkeypatch.setattr(groups, "last_locked_week", lambda season: 1)
    status, message = update(api, gid, {"deathSecondLife": True})
    assert status == 409
    assert "Week 1" in message


@pytest.mark.parametrize(
    "changes",
    [
        {},
        {"pickemTie": "half"},
        {"fees": {"weekly": -1, "yearly": 0, "death": 0}},
        {"fees": {"weekly": 10.5, "yearly": 0, "death": 0}},
        {"fees": {"weekly": 10}},
        {"potSplits": {**SPLITS, "yearly": [60, 30]}},
        {"payments": [{"method": "bitcoin", "handle": "x"}]},
        {"payments": [{"method": "zelle", "handle": "  "}]},
        {"lock": "perGame"},
    ],
)
def test_rejects_bad_changes(api, gid, changes):
    assert update(api, gid, changes)[0] == 400


def test_members_cannot_change_rules(api, gid):
    assert update(api, gid, {"pickemTie": "full"}, who=PAT)[0] == 403
    assert update(api, gid, {"pickemTie": "full"}, who=SAM)[0] == 404


def test_entry_type_recorded_on_join_and_changed_by_organizers(api, gid):
    members = {m["sub"]: m for m in call(api["groups_get"], DOM, query={"id": gid})[1]["members"]}
    assert members["u-dom"]["entryType"] == "season"
    assert members["u-pat"]["entryType"] == "weekly"

    status, member = call(api["members_update"], DOM, {"groupId": gid, "sub": "u-pat", "entryType": "season"})
    assert (status, member["entryType"]) == (200, "season")


def test_only_the_owner_changes_roles(api, gid):
    status, member = call(api["members_update"], DOM, {"groupId": gid, "sub": "u-pat", "role": "admin"})
    assert (status, member["role"]) == (200, "admin")
    # Now an admin, Pat can edit rules but still can't touch roles or the owner.
    assert update(api, gid, {"pickemTie": "full"}, who=PAT)[0] == 200
    assert call(api["members_update"], PAT, {"groupId": gid, "sub": "u-pat", "role": "member"})[0] == 403
    assert call(api["members_update"], DOM, {"groupId": gid, "sub": "u-dom", "role": "admin"})[0] == 409
    assert call(api["members_update"], DOM, {"groupId": gid, "sub": "u-nobody", "entryType": "weekly"})[0] == 404
    assert call(api["members_update"], DOM, {"groupId": gid, "sub": "u-pat"})[0] == 400
