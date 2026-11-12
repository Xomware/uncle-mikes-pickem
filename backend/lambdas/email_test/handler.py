"""POST /email/test {groupId}: send the test email to the caller's own address.

Outside the claim log, so it can be re-sent. While SES is in the sandbox it
only reaches verified addresses, and SES's refusal comes back as a 502.
"""

import os
from typing import Annotated

import boto3
from botocore.exceptions import ClientError
from pydantic import StringConstraints

from lambdas.common import mailer
from lambdas.common.api import ApiError, Request, api_handler, claims, parse_body, respond, user
from lambdas.common.groups import membership
from lambdas.common.unsubscribe import link

dynamodb = boto3.resource("dynamodb")


class SendTest(Request):
    groupId: Annotated[str, StringConstraints(min_length=1, max_length=64)]


@api_handler("email_test")
def handler(event, context):
    me = user(event)
    body = parse_body(event, SendTest)
    member = membership(dynamodb.Table(os.environ["APP_TABLE"]), body.groupId, me["sub"])
    address = claims(event)["email"].strip().lower()
    unsubscribe_url = link(me["sub"], body.groupId, "all")
    email = mailer.render("test", {"name": me["name"], "group_name": member["groupName"]}, unsubscribe_url)
    try:
        mailer.send(address, email, unsubscribe_url)
    except ClientError as e:
        raise ApiError(502, f"SES refused the send: {e.response['Error']['Message']}")
    return respond(200, {"to": address, "subject": email.subject})
