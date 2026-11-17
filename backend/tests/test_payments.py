import pytest

from lambdas.common import ledger
from tests.conftest import DOM, PAT, SAM, call, table

RULES = {
    "fees": {"weekly": 1, "yearly": 2, "death": 20},
    "potSplits": {"weekly": [100], "yearly": [60, 30, 10], "death": [100]},
    "payments": [{"method": "venmo", "handle": "@dom"}],
}
VERSIONS = [{"version": 1, "effectiveWeek": 1, **RULES}]


def entry(owner, eid):
    return {"SK": f"DEATH#{eid}", "ownerSub": owner, "label": eid}


def person(sub, entry_type, joined=1):
    return {"sub": sub, "name": sub.upper(), "entryType": entry_type, "joinedWeek": joined}


def test_fees_accrue_each_week_from_joined_week():
    season, weekly, late = person("a", "season"), person("b", "weekly"), person("c", "season", joined=3)
    assert ledger.owed(season, "weekly", VERSIONS, 4) == 4
    assert ledger.owed(season, "yearly", VERSIONS, 4) == 8
    assert ledger.owed(late, "yearly", VERSIONS, 4) == 4
    assert ledger.owed(weekly, "weekly", VERSIONS, 0) == 0
    entries = [entry("a", "e1"), entry("a", "e2"), entry("b", "e3")]
    assert [line["kind"] for line in ledger.dues(season, entries, VERSIONS, 4)] == ["weekly", "yearly", "death", "death"]
    assert ledger.dues(weekly, entries, VERSIONS, 4) == [
        {"kind": "weekly", "owed": 4},
        {"kind": "death", "entryId": "e3", "label": "e3", "owed": 20},
    ]
    assert ledger.dues(weekly, [], [], 4) == []


def test_each_week_is_priced_by_its_own_rules():
    raised = VERSIONS + [{"version": 2, "effectiveWeek": 3, **RULES, "fees": {**RULES["fees"], "weekly": 5}}]
    assert ledger.owed(person("a", "weekly"), "weekly", raised, 4) == 1 + 1 + 5 + 5


def test_per_season_basis_charges_once_at_todays_rate():
    once = [{**VERSIONS[0], "feeBasis": "perSeason"}]
    assert ledger.owed(person("a", "season"), "yearly", once, 0) == 2
    assert ledger.owed(person("a", "season", joined=9), "yearly", once, 12) == 2


def test_build_balances_and_pots():
    members = [person("a", "season"), person("b", "weekly", joined=2)]
    pays = [
        {"SK": "PAY#a#yearly", "paid": True, "amount": 4, "method": "venmo", "paidOn": "2027-09-01"},
        {"SK": "PAY#a#weekly", "paid": True, "amount": 2, "method": "venmo", "paidOn": "2027-09-01"},
        {"SK": "PAY#b#weekly", "paid": False},
    ]
    book = ledger.build(members, [entry("b", "e1")], pays, VERSIONS, 3)
    a, b = book["members"]
    assert (a["owed"], a["paid"], a["balance"]) == (9, 6, 3)
    # A payment that covered Weeks 1-2 of a fee that's now through Week 3 isn't paid up.
    assert [(line["kind"], line["owed"], line["paid"], line["amount"]) for line in a["lines"]] == [
        ("weekly", 3, False, 2), ("yearly", 6, False, 4)
    ]
    assert (b["owed"], b["paid"], b["balance"]) == (22, 0, 22)
    assert book["pots"]["weekly"] == {"entries": 2, "total": 5, "collected": 2, "payouts": [5]}
    assert book["pots"]["yearly"] == {"entries": 1, "total": 6, "collected": 4, "payouts": [3.6, 1.8, 0.6]}
    assert book["pots"]["death"]["total"] == 20
    assert (book["owedThrough"], book["feeBasis"]) == (3, "perWeek")


@pytest.fixture
def api(app, monkeypatch):
    names = ("groups_create", "invites_create", "invites_accept", "rules_update", "members_update")
    names += ("payments_ledger", "payments_mark")
    loaded = {name: app(name) for name in names}
    # Everyone joins before Week 1 locks; the ledger reads it as owed through Week 3.
    monkeypatch.setattr(loaded["payments_ledger"], "next_unlocked_week", lambda group: 4)
    return loaded


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


PAID = {"paid": True, "amount": 3, "method": "zelle", "paidOn": "2027-09-03"}


def test_organizer_sees_everyone_with_no_death_entries(api, gid):
    status, data = ledger_for(api, gid, DOM)
    assert status == 200
    assert data["group"]["name"] == "Pool"
    assert [(m["name"], m["owed"]) for m in data["members"]] == [("Dom", 9), ("Pat", 3), ("Sam", 9)]
    assert data["pots"]["weekly"]["total"] == 9
    assert data["pots"]["death"] == {"entries": 0, "total": 0, "collected": 0, "payouts": [0]}
    assert (data["owedThrough"], data["feeBasis"]) == (3, "perWeek")


def test_member_sees_only_their_own_row(api, gid):
    data = ledger_for(api, gid, PAT)[1]
    assert [m["sub"] for m in data["members"]] == ["u-pat"]
    assert data["fees"] == RULES["fees"]
    assert data["pots"]["yearly"]["total"] == 12


def test_mark_paid_then_unpaid(api, gid):
    status, data = mark(api, gid, sub="u-pat", kind="weekly", **PAID)
    assert status == 200
    assert data == {"sub": "u-pat", "kind": "weekly", "paid": True, "amount": 3, "method": "zelle", "paidOn": "2027-09-03"}
    pat = ledger_for(api, gid, PAT)[1]["members"][0]
    assert (pat["paid"], pat["balance"], pat["lines"][0]["paid"]) == (3, 0, True)
    assert ledger_for(api, gid, DOM)[1]["pots"]["weekly"]["collected"] == 3

    mark(api, gid, sub="u-pat", kind="weekly", paid=False)
    assert ledger_for(api, gid, PAT)[1]["members"][0]["balance"] == 3
    item = table().get_item(Key={"PK": f"GROUP#{gid}#S2027", "SK": "PAY#u-pat#weekly"})["Item"]
    assert (item["paid"], item["markedBy"]) == (False, "u-dom")


def test_death_entries_owe_per_entry(api, gid):
    for eid in ("e1", "e2"):
        table().put_item(Item={"PK": f"GROUP#{gid}#S2027", "SK": f"DEATH#{eid}", "ownerSub": "u-pat", "label": eid})
    pat = ledger_for(api, gid, PAT)[1]["members"][0]
    assert pat["owed"] == 43
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


def test_switching_to_per_season(api, gid):
    call(api["rules_update"], DOM, {"groupId": gid, "changes": {"feeBasis": "perSeason"}})
    data = ledger_for(api, gid, DOM)[1]
    assert [(m["name"], m["owed"]) for m in data["members"]] == [("Dom", 3), ("Pat", 1), ("Sam", 3)]
    assert data["feeBasis"] == "perSeason"
    assert call(api["rules_update"], DOM, {"groupId": gid, "changes": {"feeBasis": "perMonth"}})[0] == 400
