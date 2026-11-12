"""API Gateway plumbing: Cognito claims, the { data, error, meta } envelope, CORS echo.

The COGNITO_USER_POOLS authorizer has verified the JWT before the Lambda runs,
so handlers read the claims it deposited and never parse a raw token.
"""

import functools
import json
import logging
import os

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
        "body": json.dumps({"data": data, "error": error, "meta": meta or {}}),
    }


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
