"""Signed unsubscribe tokens: `<payload>.<mac>`, both unpadded base64url. Ported from armchair.

The payload is `<sub>:<groupId>:<scope>`, a scope from email_prefs.SCOPES, and
the MAC is HMAC-SHA256 over the encoded payload with the SecureString named by
UNSUBSCRIBE_PARAM. Tokens never expire: a link in a months-old email must still
work, and the most a token can do is turn email off.
"""

import base64
import functools
import hashlib
import hmac
import os

import boto3

from lambdas.common.email_prefs import SCOPES


@functools.cache
def _secret() -> bytes:
    ssm = boto3.client("ssm")
    return ssm.get_parameter(Name=os.environ["UNSUBSCRIBE_PARAM"], WithDecryption=True)["Parameter"]["Value"].encode()


def _b64(raw: bytes) -> str:
    return base64.urlsafe_b64encode(raw).rstrip(b"=").decode()


def _sign(payload: str) -> str:
    return _b64(hmac.new(_secret(), payload.encode(), hashlib.sha256).digest())


def make_token(sub: str, group_id: str, scope: str) -> str:
    if scope not in SCOPES:
        raise ValueError(f"Unknown unsubscribe scope {scope!r}")
    payload = _b64(f"{sub}:{group_id}:{scope}".encode())
    return f"{payload}.{_sign(payload)}"


def verify(token: str) -> tuple[str, str, str] | None:
    """(sub, groupId, scope) for a token this secret signed, else None."""
    payload, _, mac = token.partition(".")
    # Compared as the encoded string, not decoded bytes, so the unused bits in
    # base64's last character cannot yield a second valid spelling.
    if not payload or not hmac.compare_digest(mac.encode(), _sign(payload).encode()):
        return None
    parts = base64.urlsafe_b64decode(payload + "=" * (-len(payload) % 4)).decode().split(":")
    if len(parts) != 3 or not all(parts) or parts[2] not in SCOPES:
        return None
    return parts[0], parts[1], parts[2]


def link(sub: str, group_id: str, scope: str) -> str:
    """The footer and List-Unsubscribe URL: GET confirms, POST (and RFC 8058 one-click) unsubscribes."""
    return f"{os.environ['API_URL']}/email/unsubscribe?token={make_token(sub, group_id, scope)}"
