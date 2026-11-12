import importlib
import json

import boto3
import pytest
from moto import mock_aws

DOM = {"sub": "u-dom", "email": "dom@example.com", "name": "Dom"}
PAT = {"sub": "u-pat", "email": "pat@example.com", "name": "Pat"}
SAM = {"sub": "u-sam", "email": "sam@example.com", "name": "Sam"}


@pytest.fixture
def app(monkeypatch):
    """A moto pickem-app table with GSI1. Yields a loader that binds a handler module to it."""
    monkeypatch.setenv("APP_TABLE", "app")
    monkeypatch.setenv("CORS_ALLOW_ORIGIN", "https://pickem.xomware.com")
    monkeypatch.setenv("AWS_DEFAULT_REGION", "us-east-1")
    with mock_aws():
        keys = ["PK", "SK", "GSI1PK", "GSI1SK"]
        boto3.client("dynamodb").create_table(
            TableName="app",
            BillingMode="PAY_PER_REQUEST",
            KeySchema=[{"AttributeName": "PK", "KeyType": "HASH"}, {"AttributeName": "SK", "KeyType": "RANGE"}],
            AttributeDefinitions=[{"AttributeName": k, "AttributeType": "S"} for k in keys],
            GlobalSecondaryIndexes=[
                {
                    "IndexName": "GSI1",
                    "KeySchema": [
                        {"AttributeName": "GSI1PK", "KeyType": "HASH"},
                        {"AttributeName": "GSI1SK", "KeyType": "RANGE"},
                    ],
                    "Projection": {"ProjectionType": "ALL"},
                }
            ],
        )

        def load(name):
            module = importlib.import_module(f"lambdas.{name}.handler")
            monkeypatch.setattr(module, "dynamodb", boto3.resource("dynamodb"))
            return module

        yield load


def call(module, who, body=None, query=None):
    """Invoke a handler as `who`; returns (status, data or error message)."""
    event = {
        "headers": {"origin": "https://pickem.xomware.com"},
        "requestContext": {"authorizer": {"claims": who}},
        "body": None if body is None else json.dumps(body),
        "queryStringParameters": query,
    }
    out = module.handler(event, None)
    payload = json.loads(out["body"])
    return out["statusCode"], payload["data"] if payload["error"] is None else payload["error"]["message"]


def table():
    return boto3.resource("dynamodb").Table("app")
