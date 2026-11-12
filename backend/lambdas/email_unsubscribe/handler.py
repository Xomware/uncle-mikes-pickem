"""GET|POST /email/unsubscribe?token=...: turn off one email type, or all of a group's email, with no sign-in.

Ported from armchair. The route has no authorizer: the signed token
(common/unsubscribe.py) is the only credential, and all it can do is turn email off.

GET never changes anything, because link scanners prefetch GETs. It renders a
confirmation page whose form POSTs the token back. POST does the unsubscribe,
and serves both that form and RFC 8058 one-click, which mail clients send to
the List-Unsubscribe URL with the body `List-Unsubscribe=One-Click`.

Responses are small HTML pages, not the JSON envelope, because a person reads them.
"""

import base64
import html
import os
from urllib.parse import parse_qs

import boto3

from lambdas.common.api import api_handler
from lambdas.common.email_prefs import covered, describe, with_defaults
from lambdas.common.unsubscribe import verify

dynamodb = boto3.resource("dynamodb")

PAGE = """<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>{title} - Uncle Mike's NFL Pick Em</title>
<style>
body {{ margin: 0; min-height: 100vh; display: grid; place-items: center; padding: 1rem; box-sizing: border-box;
  font: 16px/1.5 Arial, Helvetica, sans-serif; background: #f1f3f6; color: #1a2233; }}
main {{ max-width: 26rem; width: 100%; padding: 1.5rem; border-radius: 8px; background: #fff;
  border: 1px solid #dde2ea; border-top: 4px solid #e2b13c; }}
.brand {{ margin: 0 0 1rem; font-size: 13px; font-weight: 700; letter-spacing: 0.14em; text-transform: uppercase; }}
h1 {{ margin: 0 0 0.5rem; font-size: 22px; color: #111a2b; }}
p {{ margin: 0 0 1rem; }}
.muted {{ color: #5a6477; font-size: 14px; }}
a {{ color: #111a2b; font-weight: 600; }}
button {{ min-height: 2.75rem; padding: 0 1.25rem; font: 700 16px Arial, Helvetica, sans-serif; border: 0;
  border-radius: 6px; background: #111a2b; color: #fff; cursor: pointer; }}
button:focus-visible, a:focus-visible {{ outline: 2px solid #e2b13c; outline-offset: 3px; }}
</style>
</head>
<body>
<main>
<p class="brand">Uncle Mike's NFL Pick Em</p>
<h1>{title}</h1>
{content}
<p class="muted">Change any email type under Email settings on <a href="{site}/profile/">your profile</a>.</p>
</main>
</body>
</html>"""

FORM = """<form method="post">
<input type="hidden" name="token" value="{token}">
<button type="submit">Unsubscribe</button>
</form>"""


def _page(status: int, title: str, content: str) -> dict:
    return {
        "statusCode": status,
        "headers": {"Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store"},
        "body": PAGE.format(title=title, content=content, site=os.environ["SITE_URL"]),
    }


def _form_token(event: dict) -> str:
    raw = event.get("body") or ""
    if event.get("isBase64Encoded"):
        raw = base64.b64decode(raw).decode()
    return (parse_qs(raw).get("token") or [""])[0]


@api_handler("email_unsubscribe")
def handler(event, context):
    # The route is ANY, since the module gives each path one method.
    method = event.get("httpMethod")
    if method not in ("GET", "POST"):
        return _page(405, "Not allowed", "<p>Open the unsubscribe link from your email.</p>")

    token = (event.get("queryStringParameters") or {}).get("token") or (
        _form_token(event) if method == "POST" else ""
    )
    parsed = verify(token)
    if parsed is None:
        return _page(400, "Link not valid", "<p>Copy the whole unsubscribe link from the email.</p>")
    sub, group_id, scope = parsed

    if method == "GET":
        return _page(200, "Unsubscribe", f"<p>Stop {describe(scope)}?</p>" + FORM.format(token=html.escape(token)))

    table = dynamodb.Table(os.environ["APP_TABLE"])
    key = {"PK": f"GROUP#{group_id}", "SK": f"MEMBER#{sub}"}
    member = table.get_item(Key=key).get("Item")
    if member is None:
        return _page(404, "Not found", "<p>You're no longer in that group, so it sends you no email.</p>")
    prefs = {**with_defaults(member.get("emailPrefs")), **dict.fromkeys(covered(scope), False)}
    table.update_item(Key=key, UpdateExpression="SET emailPrefs = :p", ExpressionAttributeValues={":p": prefs})
    return _page(200, "Unsubscribed", f"<p>You won’t get {describe(scope)} any more.</p>")
