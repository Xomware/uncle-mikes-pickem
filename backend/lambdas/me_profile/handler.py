"""GET /me/profile: upsert the caller's USER item from their ID token and return it."""

import os
from datetime import datetime, timezone

import boto3

from lambdas.common.api import ApiError, api_handler, claims, respond

dynamodb = boto3.resource("dynamodb")


@api_handler("me_profile")
def handler(event, context):
    token = claims(event)
    sub = token.get("sub")
    # Only ID tokens carry email; an access token passes the authorizer without one.
    email = (token.get("email") or "").strip().lower()
    if not sub or not email:
        raise ApiError(401, "Send the ID token, not the access token")
    name = (token.get("name") or "").strip() or email.split("@")[0]

    now = datetime.now(timezone.utc).isoformat()
    dynamodb.Table(os.environ["APP_TABLE"]).update_item(
        Key={"PK": f"USER#{sub}", "SK": "PROFILE"},
        UpdateExpression="SET email = :e, #n = :n, updatedAt = :t, createdAt = if_not_exists(createdAt, :t)",
        ExpressionAttributeNames={"#n": "name"},
        ExpressionAttributeValues={":e": email, ":n": name, ":t": now},
    )
    return respond(200, {"sub": sub, "email": email, "name": name})
