import json

import boto3
import pytest
from boto3.dynamodb.conditions import Key

from tests.conftest import BOSS, DOM, call, table
from tests.test_super import gid, ops  # noqa: F401  (fixtures)

WRITES = {
    "super_flags_set": {"scope": "global", "flags": {"payments": False}},
    "super_regrade": {"groupId": "g"},
    "super_cron": {"job": "sweep"},
}


def audits(ops):
    return ops.query(KeyConditionExpression=Key("PK").eq("AUDIT"))["Items"]


@pytest.mark.parametrize("name", sorted(WRITES))
def test_writes_404_for_everyone_but_the_super_admin(app, ops, name):
    for who in (DOM, {**BOSS, "email_verified": "false"}):
        assert call(app(name), who, WRITES[name]) == (404, "Not found")
    assert audits(ops) == []


def test_flags_set_global_and_group_with_inherit(app, ops, gid):
    module = app("super_flags_set")
    assert call(module, BOSS, {"scope": "global", "flags": {"payments": False, "maintenanceBanner": " Down at 9 "}}) == (
        200,
        {"scope": "global", "flags": {"payments": False, "maintenanceBanner": "Down at 9"}},
    )
    assert call(module, BOSS, {"scope": gid, "flags": {"payments": True, "deathPool": False}})[0] == 200
    resolved = call(app("config_flags"), DOM, query={"groupId": gid})[1]
    assert (resolved["payments"], resolved["deathPool"], resolved["maintenanceBanner"]) == (True, False, "Down at 9")

    # null drops the group's override, so payments inherits the global off again.
    assert call(module, BOSS, {"scope": gid, "flags": {"payments": None}})[1]["flags"] == {"deathPool": False}
    assert call(app("config_flags"), DOM, query={"groupId": gid})[1]["payments"] is False

    rows = audits(ops)
    assert len(rows) == 3
    last = rows[-1]
    assert (last["email"], last["action"], last["target"]) == ("boss@example.com", "flags-set", gid)
    assert (last["before"], last["after"]) == ({"payments": True, "deathPool": False}, {"deathPool": False})


@pytest.mark.parametrize(
    "body, error",
    [
        ({"scope": "global", "flags": {"nope": True}}, (400, "Unknown flag nope")),
        ({"scope": "global", "flags": {"payments": "yes"}}, (400, "payments takes a bool")),
        ({"scope": "global", "flags": {"maintenanceBanner": True}}, (400, "maintenanceBanner takes a str")),
        ({"scope": "global", "flags": {"maintenanceBanner": "x" * 281}}, (400, "maintenanceBanner is at most 280 characters")),
        ({"scope": "missing", "flags": {"payments": False}}, (404, "Group not found")),
    ],
)
def test_flags_set_rejects(app, ops, body, error):
    assert call(app("super_flags_set"), BOSS, body) == error
    assert audits(ops) == []


def test_regrade_any_group_is_audited(app, ops, gid):
    module = app("super_regrade")
    assert call(module, BOSS, {"groupId": "missing"}) == (404, "Group not found")
    status, done = call(module, BOSS, {"groupId": gid, "week": 1})
    assert status == 200 and set(done) >= {"weeks"}
    [row] = audits(ops)
    assert (row["action"], row["target"]) == ("regrade", f"{gid}#W1")


def test_cron_invokes_the_named_job_async(app, ops, monkeypatch):
    module = app("super_cron")
    monkeypatch.setenv("APP_NAME", "pickem")
    invoked = []

    class Spy:
        def invoke(self, **kwargs):
            invoked.append(kwargs)

    real = boto3.client
    monkeypatch.setattr(module.boto3, "client", lambda name, **kw: Spy() if name == "lambda" else real(name, **kw))
    assert call(module, BOSS, {"job": "tick", "payload": {"force": True}}) == (
        202,
        {"job": "tick", "function": "pickem-cron-tick"},
    )
    assert invoked == [{"FunctionName": "pickem-cron-tick", "InvocationType": "Event", "Payload": json.dumps({"force": True})}]
    assert call(module, BOSS, {"job": "deploy"})[0] == 400
    [row] = audits(ops)
    assert (row["action"], row["target"], row["after"]) == ("cron", "tick", {"force": True})
    assert table().get_item(Key={"PK": "CONFIG", "SK": "FLAGS"}).get("Item") is None
