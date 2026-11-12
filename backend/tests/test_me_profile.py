import json

import boto3
import pytest
from moto import mock_aws

ORIGINS = "https://pickem.xomware.com,http://localhost:3000"


def event(claims, origin="http://localhost:3000"):
    return {
        "headers": {"origin": origin},
        "requestContext": {"authorizer": {"claims": claims}},
    }


@pytest.fixture
def me(monkeypatch):
    monkeypatch.setenv("APP_TABLE", "app")
    monkeypatch.setenv("CORS_ALLOW_ORIGIN", ORIGINS)
    monkeypatch.setenv("AWS_DEFAULT_REGION", "us-east-1")
    with mock_aws():
        boto3.client("dynamodb").create_table(
            TableName="app",
            BillingMode="PAY_PER_REQUEST",
            KeySchema=[{"AttributeName": "PK", "KeyType": "HASH"}, {"AttributeName": "SK", "KeyType": "RANGE"}],
            AttributeDefinitions=[
                {"AttributeName": "PK", "AttributeType": "S"},
                {"AttributeName": "SK", "AttributeType": "S"},
            ],
        )
        from lambdas.me_profile import handler

        monkeypatch.setattr(handler, "dynamodb", boto3.resource("dynamodb"))
        yield handler


def item(sub):
    return boto3.resource("dynamodb").Table("app").get_item(Key={"PK": f"USER#{sub}", "SK": "PROFILE"})["Item"]


def test_returns_claims_and_upserts(me):
    out = me.handler(event({"sub": "u1", "email": "Dom@X.com", "name": "Dom"}), None)
    assert out["statusCode"] == 200
    assert out["headers"]["Access-Control-Allow-Origin"] == "http://localhost:3000"
    assert json.loads(out["body"]) == {
        "data": {"sub": "u1", "email": "dom@x.com", "name": "Dom"},
        "error": None,
        "meta": {},
    }
    first = item("u1")
    assert first["email"] == "dom@x.com"

    me.handler(event({"sub": "u1", "email": "dom@x.com", "name": "Dominick"}), None)
    second = item("u1")
    assert second["name"] == "Dominick"
    assert second["createdAt"] == first["createdAt"]


def test_access_token_is_401_with_cors(me):
    out = me.handler(event({"sub": "u1"}, origin="https://evil.example"), None)
    assert out["statusCode"] == 401
    assert out["headers"]["Access-Control-Allow-Origin"] == "https://pickem.xomware.com"
    assert json.loads(out["body"])["data"] is None


def test_missing_name_falls_back_to_email_local_part(me):
    out = me.handler(event({"sub": "u2", "email": "pat@x.com"}), None)
    assert json.loads(out["body"])["data"]["name"] == "pat"
