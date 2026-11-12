"""GET /groups/mine: every group the caller belongs to, newest season first."""

import os

import boto3
from boto3.dynamodb.conditions import Key

from lambdas.common.api import api_handler, respond, user
from lambdas.common.groups import group_summary

dynamodb = boto3.resource("dynamodb")


@api_handler("groups_mine")
def handler(event, context):
    me = user(event)
    table = dynamodb.Table(os.environ["APP_TABLE"])
    items = table.query(IndexName="GSI1", KeyConditionExpression=Key("GSI1PK").eq(f"USER#{me['sub']}"))["Items"]
    groups = sorted((group_summary(m) for m in items), key=lambda g: (-g["season"], g["name"].lower()))
    return respond(200, groups)
