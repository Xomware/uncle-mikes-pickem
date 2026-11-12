import pytest

from tests.conftest import DOM, PAT, call, table


@pytest.fixture
def api(app):
    return {name: app(name) for name in ("groups_create", "groups_mine", "groups_get")}


def create(api, who=DOM, name="Uncle Mike's", season=2027):
    status, group = call(api["groups_create"], who, {"name": name, "season": season})
    assert status == 201
    return group


def test_create_writes_meta_and_owner(api):
    group = create(api, name="  Uncle Mike's  ")
    assert group == {"groupId": group["groupId"], "name": "Uncle Mike's", "season": 2027, "role": "owner"}

    gid = group["groupId"]
    meta = table().get_item(Key={"PK": f"GROUP#{gid}", "SK": "META"})["Item"]
    assert meta["ownerSub"] == DOM["sub"]
    owner = table().get_item(Key={"PK": f"GROUP#{gid}", "SK": f"MEMBER#{DOM['sub']}"})["Item"]
    assert owner["role"] == "owner"
    assert owner["GSI1PK"] == f"USER#{DOM['sub']}"
    # No NFL data yet, so the owner's first pickable week is Week 1.
    assert owner["joinedWeek"] == 1


@pytest.mark.parametrize(
    "body",
    [
        {"name": "", "season": 2027},
        {"name": "x" * 61, "season": 2027},
        {"name": "Pool", "season": "2027"},
        {"name": "Pool", "season": 2025},
        {"name": "Pool"},
        {"name": "Pool", "season": 2027, "owner": "u-pat"},
    ],
)
def test_create_rejects_bad_bodies(api, body):
    status, message = call(api["groups_create"], DOM, body)
    assert status == 400, message


def test_access_token_is_refused(api):
    status, _ = call(api["groups_create"], {"sub": DOM["sub"]}, {"name": "Pool", "season": 2027})
    assert status == 401


def test_mine_lists_only_my_groups(api):
    old = create(api, name="Old pool", season=2026)
    new = create(api, name="New pool")
    create(api, who=PAT, name="Pat's pool")

    status, groups = call(api["groups_mine"], DOM)
    assert status == 200
    assert [g["groupId"] for g in groups] == [new["groupId"], old["groupId"]]

    assert call(api["groups_mine"], {"sub": "u-new", "email": "n@example.com"}) == (200, [])


def test_get_returns_group_and_members_to_members_only(api):
    group = create(api)
    status, data = call(api["groups_get"], DOM, query={"id": group["groupId"]})
    assert status == 200
    assert data["group"] == {"groupId": group["groupId"], "name": "Uncle Mike's", "season": 2027, "ownerSub": "u-dom"}
    assert data["role"] == "owner"
    assert data["members"] == [{"sub": "u-dom", "name": "Dom", "role": "owner", "entryType": "season", "joinedWeek": 1}]
    assert (data["rulesVersion"], data["rules"]["pickemTie"]) == (0, "zero")

    assert call(api["groups_get"], PAT, query={"id": group["groupId"]}) == (404, "Group not found")
    assert call(api["groups_get"], DOM, query={"id": "nope"}) == (404, "Group not found")
    assert call(api["groups_get"], DOM)[0] == 400
