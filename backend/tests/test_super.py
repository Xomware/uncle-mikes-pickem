from datetime import datetime, timezone

import boto3
import pytest

from lambdas.common import runs
from tests.conftest import BOSS, DOM, PAT, call, create_table, table

READS = {
    "super_overview": None,
    "super_groups": None,
    "super_group": {"id": "g"},
    "super_users": None,
    "super_flags": None,
    "super_emails": None,
}


@pytest.fixture
def ops(app, boss, monkeypatch):
    monkeypatch.setenv("OPS_TABLE", "ops")
    create_table("ops")
    return boto3.resource("dynamodb").Table("ops")


@pytest.fixture
def gid(app, ops):
    gid = call(app("groups_create"), DOM, {"name": "Pool", "season": 2027})[1]["groupId"]
    code = call(app("invites_create"), DOM, {"groupId": gid})[1]["code"]
    call(app("invites_accept"), PAT, {"code": code, "entryType": "weekly"})
    for who in (DOM, PAT):
        call(app("me_profile"), who)
    return gid


@pytest.mark.parametrize("name", sorted(READS))
def test_everyone_but_the_super_admin_gets_404(app, ops, name):
    module = app(name)
    for who in (DOM, {**BOSS, "email_verified": "false"}, {"sub": "x"}):
        assert call(module, who, query=READS[name]) == (404, "Not found")


def test_overview(app, ops, gid):
    table().put_item(Item={"PK": f"GROUP#{gid}#S2027#W01", "SK": "PICK#u-pat", "sub": "u-pat", "complete": True})
    now = datetime.now(timezone.utc)
    runs.record("cron_tick", now, {"mode": "hourly"})
    runs.record("mail_sweep", now, {"error": "ClientError: throttled"})
    ops.put_item(Item={"PK": f"MAIL#u-pat#{gid}#result#W01", "SK": "MAIL", "status": "sent", "at": now.isoformat()})
    ops.put_item(Item={"PK": f"MAIL#u-dom#{gid}#result#W01", "SK": "MAIL", "status": "failed", "at": now.isoformat()})

    status, data = call(app("super_overview"), BOSS)
    assert status == 200
    assert (data["groups"], data["users"]) == (1, 2)
    assert data["perGroup"] == [
        {"groupId": gid, "name": "Pool", "members": 2, "week": 1, "submitted": 1, "complete": 1}
    ]
    assert data["jobs"]["cron_tick"]["ok"] and data["jobs"]["capture"] is None
    assert data["jobs"]["mail_sweep"]["ok"] is False
    assert [e["job"] for e in data["errors"]] == ["mail_sweep"]
    assert data["mail"] == {"sent24h": 1, "sent7d": 1, "sentTotal": 1, "failed": 1}


def test_groups_group_and_users(app, ops, gid):
    status, groups = call(app("super_groups"), BOSS)
    assert status == 200
    assert [(g["name"], g["owner"], g["members"]) for g in groups] == [("Pool", "Dom", 2)]

    status, group = call(app("super_group"), BOSS, query={"id": gid})
    assert status == 200
    assert [m["name"] for m in group["members"]] == ["Dom", "Pat"]
    assert group["death"] == {"alive": 0, "entries": []}
    assert set(group["payments"]) == {"owed", "paid", "pots", "members"}
    assert call(app("super_group"), BOSS, query={"id": "nope"}) == (404, "Group not found")

    status, users = call(app("super_users"), BOSS)
    assert status == 200
    assert {u["email"]: [g["name"] for g in u["groups"]] for u in users} == {
        "dom@example.com": ["Pool"],
        "pat@example.com": ["Pool"],
    }


def test_flags_show_stored_overrides_only(app, ops, gid):
    table().put_item(Item={"PK": "CONFIG", "SK": "FLAGS", "flags": {"payments": False, "gone": True}})
    table().put_item(Item={"PK": f"GROUP#{gid}", "SK": "FLAGS", "flags": {"deathPool": False}})
    status, data = call(app("super_flags"), BOSS)
    assert status == 200
    assert data["global"] == {"payments": False}
    assert data["groups"] == [{"groupId": gid, "name": "Pool", "flags": {"deathPool": False}}]
    assert data["defaults"]["maintenanceBanner"] == ""


def test_emails_filter_by_group(app, ops, gid):
    ops.put_item(Item={"PK": f"MAIL#u-pat#{gid}#result#W01#v2", "SK": "MAIL", "status": "sent", "at": "2027-09-10T00:00:00+00:00"})
    ops.put_item(Item={"PK": "MAIL#u-pat#other#remind24#W01", "SK": "MAIL", "status": "sent", "at": "2027-09-09T00:00:00+00:00"})
    event = {"type": "week_confirmed", "groupId": gid, "season": 2027, "week": 1, "eventId": "result#W01"}
    ops.put_item(Item={"PK": "EVENTS", "SK": f"2027-09-10T00:00:00Z#{gid}#result#W01", **event})

    status, data = call(app("super_emails"), BOSS, query={"groupId": gid})
    assert status == 200
    assert data["claims"] == [
        {"sub": "u-pat", "groupId": gid, "eventId": "result#W01#v2", "status": "sent", "at": "2027-09-10T00:00:00+00:00"}
    ]
    assert data["events"] == [{"at": "2027-09-10T00:00:00Z", **event}]
    assert len(call(app("super_emails"), BOSS)[1]["claims"]) == 2
