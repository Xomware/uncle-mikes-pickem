from datetime import datetime, timedelta, timezone

import pytest

from lambdas.common import groups
from tests.conftest import DOM, PAT, SAM, call, table


@pytest.fixture
def api(app):
    return {name: app(name) for name in ("groups_create", "groups_get", "invites_create", "invites_accept")}


@pytest.fixture
def gid(api):
    return call(api["groups_create"], DOM, {"name": "Pool", "season": 2027})[1]["groupId"]


def invite(api, gid, who=DOM):
    status, data = call(api["invites_create"], who, {"groupId": gid})
    assert status == 201
    return data["code"]


def test_accept_joins_as_member(api, gid):
    code = invite(api, gid)
    status, data = call(api["invites_accept"], PAT, {"code": code})
    assert status == 201
    assert data == {"groupId": gid, "name": "Pool", "season": 2027, "role": "member", "joined": True}

    members = call(api["groups_get"], PAT, query={"id": gid})[1]["members"]
    assert [(m["sub"], m["role"], m["joinedWeek"]) for m in members] == [("u-dom", "owner", 1), ("u-pat", "member", 1)]


def test_joined_week_is_the_next_unlocked_week(api, gid, monkeypatch):
    monkeypatch.setattr(groups, "last_locked_week", lambda season: 6)
    call(api["invites_accept"], PAT, {"code": invite(api, gid)})
    assert table().get_item(Key={"PK": f"GROUP#{gid}", "SK": "MEMBER#u-pat"})["Item"]["joinedWeek"] == 7


def test_accepting_twice_keeps_the_existing_member(api, gid):
    code = invite(api, gid)
    status, data = call(api["invites_accept"], DOM, {"code": code})
    assert (status, data["role"], data["joined"]) == (200, "owner", False)


def test_bad_and_expired_codes(api, gid):
    assert call(api["invites_accept"], PAT, {"code": "nope"})[0] == 404

    code = invite(api, gid)
    past = (datetime.now(timezone.utc) - timedelta(seconds=1)).isoformat()
    table().update_item(
        Key={"PK": f"INVITE#{code}", "SK": "META"},
        UpdateExpression="SET expiresAt = :t",
        ExpressionAttributeValues={":t": past},
    )
    assert call(api["invites_accept"], PAT, {"code": code})[0] == 410


def test_only_organizers_create_invites(api, gid):
    call(api["invites_accept"], PAT, {"code": invite(api, gid)})
    assert call(api["invites_create"], PAT, {"groupId": gid})[0] == 403
    assert call(api["invites_create"], SAM, {"groupId": gid}) == (404, "Group not found")
