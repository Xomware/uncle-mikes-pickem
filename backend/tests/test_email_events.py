import json

import boto3
import pytest

from tests.conftest import create_table


@pytest.fixture
def events(monkeypatch):
    from moto import mock_aws

    monkeypatch.setenv("OPS_TABLE", "ops")
    with mock_aws():
        create_table("ops")
        from lambdas.common import suppression

        monkeypatch.setattr(suppression, "dynamodb", boto3.resource("dynamodb"))
        from lambdas.email_events import handler

        yield handler, suppression


def sns(*notes):
    return {"Records": [{"Sns": {"Message": json.dumps(n)}} for n in notes]}


def bounce(kind, *addresses):
    return {
        "eventType": "Bounce",
        "bounce": {"bounceType": kind, "bouncedRecipients": [{"emailAddress": a} for a in addresses]},
    }


def test_suppresses_hard_bounces_and_complaints(events):
    handler, suppression = events
    complaint = {"eventType": "Complaint", "complaint": {"complainedRecipients": [{"emailAddress": "c@x.com"}]}}

    out = handler.handler(sns(bounce("Permanent", "Gone@X.com"), complaint), None)

    assert out == {"suppressed": 2}
    assert suppression.is_suppressed("gone@x.com")
    assert suppression.is_suppressed("c@x.com")


def test_leaves_transient_bounces_and_other_events_alone(events):
    handler, suppression = events

    out = handler.handler(sns(bounce("Transient", "full@x.com"), {"eventType": "Delivery"}), None)

    assert out == {"suppressed": 0}
    assert not suppression.is_suppressed("full@x.com")
