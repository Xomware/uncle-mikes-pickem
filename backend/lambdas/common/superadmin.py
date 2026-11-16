"""The super admin: a caller whose ID-token email is in the SSM StringList named by SUPER_ADMIN_PARAM.

Terraform writes the list from Infisical /pickem SUPER_ADMIN_EMAILS. It is read on
every call, so an edit lands after the next Terraform run with no deploy. Everyone
else gets a 404, never a 403, so probing the portal says nothing about it.
"""

import os

import boto3
from boto3.dynamodb.conditions import Attr

from lambdas.common.api import ApiError, claims


def emails() -> set[str]:
    value = boto3.client("ssm").get_parameter(Name=os.environ["SUPER_ADMIN_PARAM"])["Parameter"]["Value"]
    return {e.strip().lower() for e in value.split(",") if e.strip()}


def is_super(event: dict) -> bool:
    """From the authorizer's verified claims only. Cognito sends email_verified as a string."""
    token = claims(event)
    email = (token.get("email") or "").strip().lower()
    if not token.get("sub") or not email or str(token.get("email_verified", "true")).lower() == "false":
        return False
    return email in emails()


def require(event: dict) -> dict:
    if not is_super(event):
        raise ApiError(404, "Not found")
    token = claims(event)
    return {"sub": token["sub"], "email": token["email"].strip().lower()}


# Group META items. INVITE#code items also use SK META.
GROUPS = Attr("SK").eq("META") & Attr("PK").begins_with("GROUP#")


def scan(table_env: str, **kwargs) -> list[dict]:
    """Every page of a filtered scan. Fine at this app's size, and only the super admin runs one."""
    table = boto3.resource("dynamodb").Table(os.environ[table_env])
    items = []
    while True:
        page = table.scan(**kwargs)
        items += page["Items"]
        if "LastEvaluatedKey" not in page:
            return items
        kwargs["ExclusiveStartKey"] = page["LastEvaluatedKey"]

