import json
from datetime import datetime, timezone

import boto3
import pytest

from tests.conftest import create_table, seed_week, table

LOCK = "2027-09-10T00:20:00Z"
LOCK_DT = datetime(2027, 9, 10, 0, 20, tzinfo=timezone.utc)
WEEK_PK = "GROUP#g#S2027#W01"


@pytest.fixture
def api(app, monkeypatch):
    monkeypatch.setenv("OPS_TABLE", "ops")
    monkeypatch.setenv("GOW_LINK_PARAM", "/pickem/gow-link-secret")
    create_table("ops")
    boto3.client("ssm").put_parameter(Name="/pickem/gow-link-secret", Value="g" * 64, Type="SecureString")
    from lambdas.common import gow_link

    gow_link._secret.cache_clear()
    seed_week(2027, 1, LOCK, [("100", "KC", "BUF", 10), ("101", "DAL", "PHI", 30)])
    t = table()
    t.put_item(Item={"PK": "GROUP#g", "SK": "META", "groupId": "g", "name": "Sunday Crew", "season": 2027,
                     "clock": "2027-09-07T14:00:00Z"})
    t.put_item(Item={"PK": "GROUP#g", "SK": "MEMBER#a", "sub": "a", "role": "owner"})
    t.put_item(Item={"PK": "GROUP#g", "SK": "MEMBER#m", "sub": "m", "role": "member"})
    return gow_link, app("gow_peek"), app("gow_confirm")


def run(module, query=None, body=None):
    event = {"headers": {"origin": "https://pickem.xomware.com"}, "queryStringParameters": query,
             "body": None if body is None else json.dumps(body)}
    out = module.handler(event, None)
    payload = json.loads(out["body"])
    return out["statusCode"], payload["data"] if payload["error"] is None else payload["error"]["message"]


def token(gow_link, game="100", sub="a"):
    return gow_link.make_token("g", 2027, 1, game, sub, LOCK_DT)


def gow_item():
    return table().get_item(Key={"PK": WEEK_PK, "SK": "GOW"}).get("Item")


def test_token_round_trip_and_tamper(api):
    gow_link, _, _ = api
    t = token(gow_link)
    assert gow_link.verify(t) == gow_link.Link("g", 2027, 1, "100", "a", int(LOCK_DT.timestamp()))
    payload, mac = t.split(".")
    other = token(gow_link, game="101").split(".")[0]
    assert gow_link.verify(f"{other}.{mac}") is None
    assert gow_link.verify(payload) is None
    assert gow_link.verify("") is None


def test_peek_shows_the_game_and_changes_nothing(api):
    gow_link, peek, _ = api
    status, data = run(peek, query={"t": token(gow_link)})
    assert status == 200
    assert (data["groupName"], data["week"], data["state"], data["gow"]) == ("Sunday Crew", 1, "open", None)
    assert (data["game"]["away"], data["game"]["home"], data["game"]["hype"]) == ("KC", "BUF", 10)
    assert gow_item() is None


def test_confirm_sets_the_gow_once(api):
    gow_link, peek, confirm = api
    t = token(gow_link)
    status, data = run(confirm, body={"t": t})
    assert status == 200 and data["gow"]["gameId"] == "100" and data["gow"]["chosenBy"] == "a"
    assert gow_item()["chosenAt"] == "2027-09-07T14:00:00Z"
    assert run(confirm, body={"t": t}) == (409, "This link was already used. Choose again from the picks page.")
    assert run(peek, query={"t": t})[1]["state"] == "used"


def test_bad_token_member_link_canceled_and_locked(api):
    gow_link, peek, confirm = api
    assert run(confirm, body={"t": "nope.nope"})[0] == 400
    assert run(confirm, body={"t": token(gow_link, sub="m")})[0] == 403

    table().put_item(Item={"PK": WEEK_PK, "SK": "CANCELED", "gameIds": ["101"]})
    assert run(peek, query={"t": token(gow_link, game="101")})[1]["state"] == "canceled"
    assert run(confirm, body={"t": token(gow_link, game="101")})[0] == 409

    table().update_item(Key={"PK": "GROUP#g", "SK": "META"}, UpdateExpression="SET clock = :c",
                        ExpressionAttributeValues={":c": "2027-09-10T00:20:00Z"})
    assert run(peek, query={"t": token(gow_link)})[1]["state"] == "closed"
    assert run(confirm, body={"t": token(gow_link)}) == (409, "Week 1 has locked, so its GOW can't change")
    assert gow_item() is None
