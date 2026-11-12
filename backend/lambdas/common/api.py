"""API Gateway plumbing: Cognito claims, the { data, error, meta } envelope, CORS echo.

The COGNITO_USER_POOLS authorizer has verified the JWT before the Lambda runs,
so handlers read the claims it deposited and never parse a raw token.
"""

import functools
import json
import logging
import os
from decimal import Decimal
from typing import TypeVar

from pydantic import BaseModel, ConfigDict, ValidationError

log = logging.getLogger()
log.setLevel(logging.INFO)


class ApiError(Exception):
    def __init__(self, status: int, message: str):
        super().__init__(message)
        self.status = status
        self.message = message


def respond(status: int, data=None, error: dict | None = None, meta: dict | None = None) -> dict:
    return {
        "statusCode": status,
        "headers": {
            "Content-Type": "application/json",
            "Access-Control-Allow-Headers": "Authorization,Content-Type",
            "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
        },
        "body": json.dumps({"data": data, "error": error, "meta": meta or {}}, default=_number),
    }


def _number(value):
    # boto3 reads every DynamoDB number back as a Decimal, which json can't encode.
    if isinstance(value, Decimal):
        return int(value) if value == value.to_integral_value() else float(value)
    raise TypeError(f"{type(value).__name__} is not JSON serializable")


def allow_origin(event: dict) -> str:
    """The caller's Origin when allowed, else the first allowed origin."""
    allowed = os.environ["CORS_ALLOW_ORIGIN"].split(",")
    headers = event.get("headers") or {}
    origin = headers.get("origin") or headers.get("Origin")
    return origin if origin in allowed else allowed[0]


def api_handler(name: str):
    """ApiError becomes its status; anything else a 500 with the trace in the log, not the body."""

    def decorate(fn):
        @functools.wraps(fn)
        def wrapper(event, context):
            try:
                response = fn(event, context)
            except ApiError as e:
                log.warning("%s rejected: %s %s", name, e.status, e.message)
                response = respond(e.status, error={"message": e.message})
            except Exception:
                log.exception("%s failed", name)
                response = respond(500, error={"message": "Internal error"})
            # Set on errors too, or the browser hides the status behind a CORS failure.
            response["headers"]["Access-Control-Allow-Origin"] = allow_origin(event)
            return response

        return wrapper

    return decorate


def claims(event: dict) -> dict:
    return ((event.get("requestContext") or {}).get("authorizer") or {}).get("claims") or {}


def user(event: dict) -> dict:
    """sub and display name from the ID token. An access token has no email and is refused."""
    token = claims(event)
    sub = token.get("sub")
    email = (token.get("email") or "").strip().lower()
    if not sub or not email:
        raise ApiError(401, "Send the ID token, not the access token")
    return {"sub": sub, "name": (token.get("name") or "").strip() or email.split("@")[0]}


class Request(BaseModel):
    """Request bodies: unknown keys are an error and "20" is not 20."""

    model_config = ConfigDict(extra="forbid", strict=True)


Body = TypeVar("Body", bound=BaseModel)


def parse_body(event: dict, model: type[Body]) -> Body:
    try:
        return model.model_validate_json(event.get("body") or "{}")
    except ValidationError as e:
        problems = "; ".join(f"{'.'.join(map(str, err['loc'])) or 'body'}: {err['msg']}" for err in e.errors())
        raise ApiError(400, problems)


def query_param(event: dict, name: str) -> str:
    value = ((event.get("queryStringParameters") or {}).get(name) or "").strip()
    if not value:
        raise ApiError(400, f"Missing ?{name}=")
    return value
