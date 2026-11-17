import pytest

from lambdas.common import payouts
from lambdas.common.weeks import week_pk
from tests.conftest import DOM, PAT, SAM, call, table

RULES = {
    "fees": {"weekly": 1, "yearly": 2, "death": 20},
    "potSplits": {"weekly": [100], "yearly": [60, 30, 10], "death": [100]},
    "payments": [],
}
VERSIONS = [{"version": 1, "effectiveWeek": 1, **RULES}]


def person(sub, entry_type="season", joined=1, name=None):
    return {"sub": sub, "name": name or sub.upper(), "entryType": entry_type, "joinedWeek": joined}


def result(week, winners, status="final"):
    return {"week": week, "status": status, "winners": winners}


def standings(*rows, final=True, through=18):
    return {"final": final, "throughWeek": through, "rows": [{"member": m, "place": p} for m, p in rows]}


def entry(eid, owner, out=None):
    return {"SK": f"DEATH#{eid}", "ownerSub": owner, "label": eid, **({"eliminatedWeek": out} if out else {})}


def test_even_split_gives_leftover_cents_to_the_first():
    assert payouts.even(1000, ["a", "b", "c"]) == {"a": 334, "b": 333, "c": 333}
    assert payouts.even(7, ["z"]) == {"z": 7}


@pytest.mark.parametrize(
    "places, want",
    [
        # Two tied for 2nd split 30% + 10%; the odd cent goes to first.
        ([("a", 1), ("b", 2), ("c", 2)], {"a": 601, "b": 200, "c": 200}),
        # Two tied for 1st split 60% + 30%; 3rd keeps 10%.
        ([("a", 1), ("b", 1), ("c", 3)], {"a": 451, "b": 450, "c": 100}),
        # Nobody holds 2nd or 3rd: their shares go to first.
        ([("a", 1)], {"a": 1001}),
        # Places past the split pay nothing.
        ([("a", 1), ("b", 2), ("c", 3), ("d", 4)], {"a": 601, "b": 300, "c": 100, "d": 0}),
    ],
)
def test_golf_split_by_place(places, want):
    out = payouts.by_place(1001, [60, 30, 10], places)
    assert out == want
    assert sum(out.values()) == 1001


def test_three_way_tie_over_two_places_keeps_every_cent():
    out = payouts.by_place(1000, [50, 50], [("a", 1), ("b", 1), ("c", 1)])
    assert out == {"a": 334, "b": 333, "c": 333}


def test_weekly_pot_grows_with_late_joiners_and_fee_changes():
    members = [person("a"), person("b", joined=3)]
    raised = VERSIONS + [{"version": 2, "effectiveWeek": 4, **RULES, "fees": {**RULES["fees"], "weekly": 5}}]
    assert [payouts.weekly_pot(members, raised, w, 5) for w in (1, 2, 3, 4)] == [100, 100, 200, 1000]


def test_per_season_weekly_pot_spreads_over_18_weeks():
    once = [{**VERSIONS[0], "feeBasis": "perSeason"}]
    members = [person("a"), person("b"), person("c")]
    pots = [payouts.weekly_pot(members, once, w, 5) for w in range(1, 19)]
    assert pots[0] == 16 and pots[-1] == 28 and sum(pots) == 300


def build(members, results=(), table_=None, entries=(), marks=(), through=3):
    return payouts.build(members, VERSIONS, through, list(results), table_, list(entries), list(marks))


def test_weekly_winners_split_by_name_and_only_final_weeks_count_as_won():
    members = [person("z", name="Zed"), person("a", name="Amy"), person("b", name="Bo")]
    book = build(members, [result(1, ["z", "a"]), result(2, ["b"], status="provisional"), result(3, [], status="open")])
    assert [(w["week"], w["pot"], w["winners"]) for w in book["weeks"]] == [(1, 300, ["a", "z"]), (2, 300, ["b"]), (3, 300, [])]
    assert [(p["week"], p["sub"], p["amount"], p["final"]) for p in book["payouts"]] == [
        (1, "a", 150, True), (1, "z", 150, True), (2, "b", 300, False)
    ]
    assert [(t["sub"], t["won"], t["pending"]) for t in book["members"]] == [("a", 150, 0), ("z", 150, 0), ("b", 0, 300)]


def test_odd_weekly_pot_gives_the_extra_cent_to_the_first_name():
    members = [person(s) for s in "abc"]
    raised = [{**VERSIONS[0], "fees": {**RULES["fees"], "weekly": 1}}]
    book = payouts.build(members, raised, 1, [result(1, ["c", "b"])], None, [], [])
    assert {p["sub"]: p["amount"] for p in book["payouts"]} == {"b": 150, "c": 150}
    members.append(person("d"))
    book = payouts.build(members, raised, 1, [result(1, ["d", "b", "c"])], None, [], [])
    assert [(p["sub"], p["amount"]) for p in book["payouts"]] == [("b", 134), ("c", 133), ("d", 133)]


def test_season_pot_is_projected_until_the_table_is_final():
    members = [person("a"), person("b"), person("c"), person("w", "weekly")]
    # Three season members at $2 a week for 18 weeks: $108, of which Weeks 1-3 have accrued $18.
    live = build(members, table_=standings(("a", "1"), ("b", "2"), ("c", "2"), final=False, through=3))
    assert live["season"] == {"pot": 10800, "accrued": 1800, "final": False, "throughWeek": 3}
    assert {p["sub"]: (p["amount"], p["final"]) for p in live["payouts"]} == {
        "a": (6480, False), "b": (2160, False), "c": (2160, False)
    }
    done = build(members, table_=standings(("a", "1"), ("b", "2"), ("c", "2")), through=18)
    assert done["season"]["final"] and all(p["final"] for p in done["payouts"])


def test_death_pool_last_standing_takes_it_all():
    members = [person("a"), person("b")]
    book = build(members, entries=[entry("e1", "a"), entry("e2", "b", out=4), entry("e3", "b", out=6)])
    assert book["death"] == {
        "pot": 6000, "entries": 3, "alive": 1, "decided": True, "winners": [{"entryId": "e1", "label": "e1", "sub": "a"}]
    }
    assert [(p["pot"], p["sub"], p["amount"]) for p in book["payouts"]] == [("death", "a", 6000)]


def test_death_pool_splits_after_week_18_and_waits_before_it():
    members = [person("a"), person("b")]
    entries = [entry("e1", "b"), entry("e2", "a"), entry("e3", "a"), entry("e4", "b", out=2)]
    running = build(members, entries=entries)
    assert (running["death"]["decided"], running["death"]["winners"], running["payouts"]) == (False, [], [])
    over = build(members, table_=standings(("a", "1"), ("b", "2")), entries=entries, through=18)
    death = {p["sub"]: p["amount"] for p in over["payouts"] if p["pot"] == "death"}
    # $80 over three live entries is 2666 cents each, and a's first entry (first by name) takes the 2 left over.
    assert death == {"a": 5334, "b": 2666}


def test_sent_marks_count_toward_the_winner():
    members = [person("a"), person("b")]
    marks = [
        {"SK": "PAYOUT#a#weekly#W01", "sub": "a", "sent": True, "amount": 200},
        {"SK": "PAYOUT#b#weekly#W02", "sub": "b", "sent": False},
    ]
    book = build(members, [result(1, ["a"]), result(2, ["b"])], marks=marks)
    assert [(p["sub"], p["sent"]) for p in book["payouts"]] == [("a", True), ("b", False)]
    assert [(t["sub"], t["won"], t["sent"]) for t in book["members"]] == [("a", 200, 200), ("b", 200, 0)]


@pytest.fixture
def api(app, monkeypatch):
    names = ("groups_create", "invites_create", "invites_accept", "rules_update", "payments_payouts", "payments_payout_mark")
    loaded = {name: app(name) for name in names}
    monkeypatch.setattr(payouts, "next_unlocked_week", lambda group: 3)
    return loaded


@pytest.fixture
def gid(api):
    gid = call(api["groups_create"], DOM, {"name": "Pool", "season": 2027})[1]["groupId"]
    code = call(api["invites_create"], DOM, {"groupId": gid})[1]["code"]
    call(api["invites_accept"], PAT, {"code": code, "entryType": "weekly"})
    call(api["invites_accept"], SAM, {"code": code, "entryType": "season"})
    call(api["rules_update"], DOM, {"groupId": gid, "changes": {"fees": RULES["fees"], "potSplits": RULES["potSplits"]}})
    for week, winners in ((1, ["u-pat"]), (2, ["u-dom", "u-sam"])):
        table().put_item(Item={"PK": week_pk(gid, 2027, week), "SK": "RESULT", "status": "final", **result(week, winners)})
    return gid


def payouts_for(api, gid, who):
    return call(api["payments_payouts"], who, query={"id": gid})


def mark(api, gid, who=DOM, **body):
    return call(api["payments_payout_mark"], who, {"groupId": gid, **body})


SENT = {"sent": True, "method": "venmo", "sentOn": "2027-09-20"}


def test_every_member_sees_all_payouts(api, gid):
    status, data = payouts_for(api, gid, PAT)
    assert status == 200
    assert (data["role"], data["throughWeek"]) == ("member", 2)
    assert [(w["week"], w["pot"], w["winners"]) for w in data["weeks"]] == [(1, 300, ["u-pat"]), (2, 300, ["u-dom", "u-sam"])]
    assert [(t["name"], t["won"]) for t in data["members"]] == [("Pat", 300), ("Dom", 150), ("Sam", 150)]
    outsider = {"sub": "u-out", "email": "out@example.com", "name": "Out"}
    assert payouts_for(api, gid, outsider)[0] == 404


def test_organizer_marks_a_payout_sent_at_the_computed_amount(api, gid):
    status, data = mark(api, gid, sub="u-sam", pot="weekly", week=2, **SENT)
    assert status == 200
    assert data == {"sub": "u-sam", "pot": "weekly", "week": 2, "sent": True, "amount": 150, "method": "venmo", "sentOn": "2027-09-20"}
    sam = next(t for t in payouts_for(api, gid, SAM)[1]["members"] if t["sub"] == "u-sam")
    assert (sam["won"], sam["sent"]) == (150, 150)

    assert mark(api, gid, sub="u-sam", pot="weekly", week=2, sent=False)[0] == 200
    item = table().get_item(Key={"PK": f"GROUP#{gid}#S2027", "SK": "PAYOUT#u-sam#weekly#W02"})["Item"]
    assert (item["sent"], item["markedBy"]) == (False, "u-dom")


@pytest.mark.parametrize(
    "who, body, status",
    [
        (PAT, {"sub": "u-pat", "pot": "weekly", "week": 1, **SENT}, 403),
        (DOM, {"sub": "u-sam", "pot": "weekly", "week": 1, **SENT}, 409),
        (DOM, {"sub": "u-sam", "pot": "yearly", **SENT}, 409),
        (DOM, {"sub": "u-pat", "pot": "weekly", **SENT}, 400),
        (DOM, {"sub": "u-pat", "pot": "death", "week": 1, **SENT}, 400),
        (DOM, {"sub": "u-pat", "pot": "weekly", "week": 1, "sent": True}, 400),
    ],
)
def test_payout_mark_rejects(api, gid, who, body, status):
    assert mark(api, gid, who=who, **body)[0] == status
