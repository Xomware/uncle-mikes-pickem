"""POST /super/cron {job, payload?}: start a scheduled job now. Super admin only, audited.

Invoked async: capture and the mail sweep run past API Gateway's 29 s limit. The
outcome lands in the job's POLL# rows, which the overview shows.
"""

import json
import os
from typing import Literal

import boto3

from lambdas.common import superadmin
from lambdas.common.api import Request, api_handler, parse_body, respond

# Function name suffixes. IAM allows invoking exactly these (lambda.tf, super_cron_invoke).
JOBS = {"tick": "cron-tick", "capture": "capture", "replay-load": "replay-load", "sweep": "mail-sweep"}


class RunJob(Request):
    job: Literal["tick", "capture", "replay-load", "sweep"]
    payload: dict = {}


@api_handler("super_cron")
def handler(event, context):
    who = superadmin.require(event)
    body = parse_body(event, RunJob)
    function = f"{os.environ['APP_NAME']}-{JOBS[body.job]}"
    boto3.client("lambda").invoke(FunctionName=function, InvocationType="Event", Payload=json.dumps(body.payload))
    superadmin.audit(who, "cron", body.job, None, body.payload)
    return respond(202, {"job": body.job, "function": function})
