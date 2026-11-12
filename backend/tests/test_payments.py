import pytest

from lambdas.common import ledger
from tests.conftest import DOM, PAT, SAM, call, table

RULES = {
    "fees": {"weekly": 10, "yearly": 100, "death": 20},
    "potSplits": {"weekly": [100], "yearly": [60, 30, 10], "death": [100]},
    "payments": [{"method": "venmo", "handle": "@dom"}],
}


def entry(owner, eid):
    return {"SK": f"DEATH#{eid}", "ownerSub": owner, "label": eid}


def test_dues_follow_entry_type_and_death_entries():
    season = {"sub": "a", "name": "A", "entryType": "season"}
    weekly = {"sub": "b", "name": "B", "entryType": "weekly"}
    entries = [entry("a", "e1"), entry("a", "e2"), entry("b", "e3")]
    assert [line["kind"] for line in ledger.dues(season, entries, RULES["fees"])] == ["weekly", "yearly", "death", "death"]
    assert ledger.dues(weekly, entries, RULES["fees"]) == [
        {"kind": "weekly", "owed": 10},
        {"kind": "death", "entryId": "e3", "label": "e3", "owed": 20},
    ]
    assert ledger.dues(weekly, [], {"weekly": 0, "yearly": 0, "death": 0}) == []


def test_build_balances_and_pots():
    members = [{"sub": "a", "name": "A", "entryType": "season"}, {"sub": "b", "name": "B", "entryType": "weekly"}]
    pays = [
        {"SK": "PAY#a#yearly", "paid": True, "amount": 100, "method": "venmo", "paidOn": "2027-09-01"},
        {"SK": "PAY#b#weekly", "paid": False},
    ]
    book = ledger.build(members, [entry("b", "e1")], pays, RULES)
    a, b = book["members"]
    assert (a["owed"], a["paid"], a["balance"]) == (110, 100, 10)
    assert a["lines"][1] == {"kind": "yearly", "owed": 100, "paid": True, "amount": 100, "method": "venmo", "paidOn": "2027-09-01"}
    assert (b["owed"], b["paid"], b["balance"]) == (30, 0, 30)
    assert book["pots"]["weekly"] == {"entries": 2, "total": 20, "collected": 0, "payouts": [20]}
    assert book["pots"]["yearly"] == {"entries": 1, "total": 100, "collected": 100, "payouts": [60, 30, 10]}
    assert book["pots"]["death"]["total"] == 20


@pytest.fixture
def api(app):
    names = ("groups_create", "invites_create", "invites_accept", "rules_update", "members_update")
    names += ("payments_ledger", "payments_mark")
    return {name: app(name) for name in names}


@pytest.fixture
def gid(api):
    gid = call(api["groups_create"], DOM, {"name": "Pool", "season": 2027})[1]["groupId"]
    code = call(api["invites_create"], DOM, {"groupId": gid})[1]["code"]
    call(api["invites_accept"], PAT, {"code": code, "entryType": "weekly"})
    call(api["invites_accept"], SAM, {"code": code, "entryType": "season"})
    call(api["rules_update"], DOM, {"groupId": gid, "changes": {"fees": RULES["fees"], "potSplits": RULES["potSplits"]}})
    return gid


def ledger_for(api, gid, who):
    return call(api["payments_ledger"], who, query={"id": gid})


def mark(api, gid, who=DOM, **body):
    return call(api["payments_mark"], who, {"groupId": gid, **body})


PAID = {"paid": True, "amount": 10, "method": "zelle", "paidOn": "2027-09-03"}


def test_organizer_sees_everyone_with_no_death_entries(api, gid):
    status, data = ledger_for(api, gid, DOM)
    assert status == 200
    assert data["group"]["name"] == "Pool"
    assert [(m["name"], m["owed"]) for m in data["members"]] == [("Dom", 110), ("Pat", 10), ("Sam", 110)]
    assert data["pots"]["weekly"]["total"] == 30
    assert data["pots"]["death"] == {"entries": 0, "total": 0, "collected": 0, "payouts": [0]}


def test_member_sees_only_their_own_row(api, gid):
    data = ledger_for(api, gid, PAT)[1]
    assert [m["sub"] for m in data["members"]] == ["u-pat"]
    assert data["fees"] == RULES["fees"]
    assert data["pots"]["yearly"]["total"] == 200


def test_mark_paid_then_unpaid(api, gid):
    status, data = mark(api, gid, sub="u-pat", kind="weekly", **PAID)
    assert status == 200
    assert data == {"sub": "u-pat", "kind": "weekly", "paid": True, "amount": 10, "method": "zelle", "paidOn": "2027-09-03"}
    pat = ledger_for(api, gid, PAT)[1]["members"][0]
    assert (pat["paid"], pat["balance"]) == (10, 0)
    assert ledger_for(api, gid, DOM)[1]["pots"]["weekly"]["collected"] == 10

    mark(api, gid, sub="u-pat", kind="weekly", paid=False)
    assert ledger_for(api, gid, PAT)[1]["members"][0]["balance"] == 10
    item = table().get_item(Key={"PK": f"GROUP#{gid}#S2027", "SK": "PAY#u-pat#weekly"})["Item"]
    assert (item["paid"], item["markedBy"]) == (False, "u-dom")


def test_death_entries_owe_per_entry(api, gid):
    for eid in ("e1", "e2"):
        table().put_item(Item={"PK": f"GROUP#{gid}#S2027", "SK": f"DEATH#{eid}", "ownerSub": "u-pat", "label": eid})
    pat = ledger_for(api, gid, PAT)[1]["members"][0]
    assert pat["owed"] == 50
    assert mark(api, gid, sub="u-pat", kind="death", entryId="e2", **{**PAID, "amount": 20})[0] == 200
    pat = ledger_for(api, gid, PAT)[1]["members"][0]
    assert [line["paid"] for line in pat["lines"] if line["kind"] == "death"] == [False, True]
    assert mark(api, gid, sub="u-sam", kind="death", entryId="e1", **PAID)[0] == 404


@pytest.mark.parametrize(
    "body, status",
    [
        ({"sub": "u-pat", "kind": "yearly", **PAID}, 409),
        ({"sub": "u-nobody", "kind": "weekly", **PAID}, 404),
        ({"sub": "u-pat", "kind": "weekly", "paid": True, "amount": 10}, 400),
        ({"sub": "u-pat", "kind": "weekly", "entryId": "e1", **PAID}, 400),
        ({"sub": "u-pat", "kind": "death", **PAID}, 400),
        ({"sub": "u-pat", "kind": "weekly", **PAID, "amount": "10"}, 400),
    ],
)
def test_mark_rejects(api, gid, body, status):
    assert mark(api, gid, **body)[0] == status


def test_only_organizers_mark_and_only_members_read(api, gid):
    assert mark(api, gid, who=PAT, sub="u-pat", kind="weekly", **PAID)[0] == 403
    outsider = {"sub": "u-out", "email": "out@example.com", "name": "Out"}
    assert ledger_for(api, gid, outsider)[0] == 404
