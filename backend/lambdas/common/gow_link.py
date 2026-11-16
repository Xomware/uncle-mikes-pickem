"""Signed GOW links from the admin email (BRAINSTORM.md 3A): `<payload>.<mac>`, both unpadded base64url.

The payload is `<groupId>:<season>:<week>:<gameId>:<adminSub>:<exp>` with exp the
week's lock as epoch seconds; the MAC is HMAC-SHA256 under the SecureString named
by GOW_LINK_PARAM. A link only opens /gow/, which shows the game: mail scanners
fetch every link, so choosing takes the page's POST. Each token is single use
(ops `GOWLINK#<groupId>` / `<mac>`) and dead after lock.
"""

import base64
import functools
import hashlib
import hmac
import os
from datetime import datetime
from typing import NamedTuple

import boto3

from lambdas.common import nfl_store
from lambdas.common.api import ApiError


class Link(NamedTuple):
    group_id: str
    season: int
    week: int
    game_id: str
    admin_sub: str
    exp: int


@functools.cache
def _secret() -> bytes:
    ssm = boto3.client("ssm")
    return ssm.get_parameter(Name=os.environ["GOW_LINK_PARAM"], WithDecryption=True)["Parameter"]["Value"].encode()


def _b64(raw: bytes) -> str:
    return base64.urlsafe_b64encode(raw).rstrip(b"=").decode()


def _sign(payload: str) -> str:
    return _b64(hmac.new(_secret(), payload.encode(), hashlib.sha256).digest())


def make_token(group_id: str, season: int, week: int, game_id: str, admin_sub: str, lock: datetime) -> str:
    payload = _b64(f"{group_id}:{season}:{week}:{game_id}:{admin_sub}:{int(lock.timestamp())}".encode())
    return f"{payload}.{_sign(payload)}"


def verify(token: str) -> Link | None:
    """The link this secret signed, else None. Expiry is the caller's check, against the group's clock."""
    payload, _, mac = token.partition(".")
    # Compared as the encoded string, so base64's unused tail bits can't yield a second valid spelling.
    if not payload or not hmac.compare_digest(mac.encode(), _sign(payload).encode()):
        return None
    parts = base64.urlsafe_b64decode(payload + "=" * (-len(payload) % 4)).decode().split(":")
    if len(parts) != 6 or not all(parts):
        return None
    gid, season, week, game, sub, exp = parts
    return Link(gid, int(season), int(week), game, sub, int(exp))


def used_key(link: Link, token: str) -> dict:
    return {"PK": f"GOWLINK#{link.group_id}", "SK": token.partition(".")[2]}


def resolve(table, token: str) -> tuple[Link, dict, nfl_store.Feed, dict]:
    """(link, group META, the group's feed, the WEEK) for a token, or the ApiError the page shows."""
    link = verify(token)
    if not link:
        raise ApiError(400, "This link isn't valid. Open the latest GOW email or choose on the picks page.")
    group = table.get_item(Key={"PK": f"GROUP#{link.group_id}", "SK": "META"}).get("Item")
    if not group:
        raise ApiError(404, "Group not found")
    feed = nfl_store.for_group(group)
    nfl_week = feed.week(link.week)
    if not nfl_week or link.game_id not in nfl_week["gameIds"]:
        raise ApiError(404, f"That game isn't on the Week {link.week} schedule any more")
    return link, group, feed, nfl_week


def closed(link: Link, feed: nfl_store.Feed, nfl_week: dict) -> bool:
    return feed.locked(nfl_week) or feed.now.timestamp() >= link.exp
