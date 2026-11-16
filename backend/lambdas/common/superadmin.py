"""The super admin: a caller whose ID-token email is in the SSM StringList named by SUPER_ADMIN_PARAM.

Terraform writes the list from Infisical /pickem SUPER_ADMIN_EMAILS. It is read on
every call, so an edit lands after the next Terraform run with no deploy. Everyone
else gets the 404 an unknown path would, so the portal can't be found by probing.
"""

import os

import boto3

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

