import pytest

from tests.conftest import DOM, PAT, SAM, call, seed_week, table

# Week 1 2027 locks Thursday 2027-09-09 20:20 ET; the GOW deadline is the Tuesday before, noon ET.
LOCK = "2027-09-10T00:20:00Z"
GAMES = [("101", "BAL", "KC", 40), ("102", "PIT", "CIN", 61.5)]


@pytest.fixture
def api(app):
    seed_week(2027, 1, LOCK, GAMES)
    names = ("groups_create", "invites_create", "invites_accept", "rules_update", "gow_set", "admin_overview")
    return {name: app(name) for name in names}


@pytest.fixture
def gid(api):
    gid = call(api["groups_create"], DOM, {"name": "Pool", "season": 2027})[1]["groupId"]
    code = call(api["invites_create"], DOM, {"groupId": gid})[1]["code"]
    call(api["invites_accept"], PAT, {"code": code, "entryType": "season"})
    call(api["invites_accept"], SAM, {"code": code, "entryType": "weekly"})
    return gid


def overview(api, who=DOM):
    status, data = call(api["admin_overview"], who)
    assert status == 200
    return data


def test_this_weeks_checklist(api, gid):
    table().put_item(Item={"PK": f"GROUP#{gid}#S2027#W01", "SK": "PICK#u-pat", "sub": "u-pat", "complete": True})
    table().put_item(Item={"PK": f"GROUP#{gid}#S2027#W01", "SK": "PICK#u-sam", "sub": "u-sam", "complete": False})
    assert overview(api) == [
        {
            "groupId": gid,
            "name": "Pool",
            "season": 2027,
            "role": "owner",
            "replay": False,
            "week": 1,
            "lockAt": LOCK,
            "gow": None,
            "gowDeadline": "2027-09-07T16:00:00Z",
            "members": 3,
            "missing": ["Dom", "Sam"],
            "unpaid": {"count": 0, "amount": 0, "names": []},
        }
    ]


def test_gow_names_the_game_and_who_chose_it(api, gid):
    call(api["gow_set"], DOM, {"groupId": gid, "week": 1, "gameId": "102"})
    assert overview(api)[0]["gow"] == {"gameId": "102", "matchup": "PIT @ CIN", "chosenBy": "Dom"}


def test_unpaid_comes_from_the_ledger(api, gid):
    call(api["rules_update"], DOM, {"groupId": gid, "changes": {"fees": {"weekly": 1, "yearly": 2, "death": 20}}})
    table().put_item(Item={"PK": f"GROUP#{gid}#S2027", "SK": "DEATH#e1", "entryId": "e1", "ownerSub": "u-sam", "label": "Sam 1"})
    assert overview(api)[0]["unpaid"] == {"count": 1, "amount": 20, "names": ["Sam"]}


def test_payments_off_leaves_unpaid_out(api, gid):
    table().put_item(Item={"PK": f"GROUP#{gid}", "SK": "FLAGS", "flags": {"payments": False}})
    assert overview(api)[0]["unpaid"] is None


def test_only_groups_the_caller_organizes(api, gid):
    assert overview(api, PAT) == []


def test_past_seasons_are_left_out(api, gid):
    seed_week(2028, 1, "2028-09-08T00:20:00Z", GAMES)
    assert overview(api) == []
