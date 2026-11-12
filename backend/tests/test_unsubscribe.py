import boto3
import pytest
from moto import mock_aws


@pytest.fixture
def tokens(monkeypatch):
    monkeypatch.setenv("UNSUBSCRIBE_PARAM", "/pickem/email-unsubscribe-secret")
    with mock_aws():
        boto3.client("ssm").put_parameter(Name="/pickem/email-unsubscribe-secret", Value="k" * 64, Type="SecureString")
        from lambdas.common import unsubscribe

        unsubscribe._secret.cache_clear()
        yield unsubscribe


def test_round_trips(tokens):
    assert tokens.verify(tokens.make_token("u-pat", "g1", "death")) == ("u-pat", "g1", "death")


def test_rejects_a_tampered_or_truncated_token(tokens):
    token = tokens.make_token("u-pat", "g1", "results")
    payload, mac = token.split(".")
    forged = tokens._b64(b"u-dom:g1:results")

    assert tokens.verify(f"{forged}.{mac}") is None
    assert tokens.verify(payload) is None
    assert tokens.verify(f"{payload}.{mac[:-1]}") is None
    assert tokens.verify("") is None


def test_refuses_unknown_scopes(tokens):
    with pytest.raises(ValueError):
        tokens.make_token("u-pat", "g1", "everything")
