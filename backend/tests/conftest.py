import boto3
import pytest
from moto import mock_aws


def create_table(name):
    boto3.client("dynamodb").create_table(
        TableName=name,
        BillingMode="PAY_PER_REQUEST",
        KeySchema=[{"AttributeName": "PK", "KeyType": "HASH"}, {"AttributeName": "SK", "KeyType": "RANGE"}],
        AttributeDefinitions=[
            {"AttributeName": "PK", "AttributeType": "S"},
            {"AttributeName": "SK", "AttributeType": "S"},
        ],
    )


@pytest.fixture
def store(monkeypatch):
    """nfl_store against moto pickem-nfl and pickem-ops tables."""
    monkeypatch.setenv("NFL_TABLE", "nfl")
    monkeypatch.setenv("OPS_TABLE", "ops")
    monkeypatch.setenv("AWS_DEFAULT_REGION", "us-east-1")
    with mock_aws():
        create_table("nfl")
        create_table("ops")
        from lambdas.common import nfl_store

        monkeypatch.setattr(nfl_store, "dynamodb", boto3.resource("dynamodb"))
        yield nfl_store
