"""GET /config/flags?groupId=: the resolved feature flags, global or for one group, so the site hides what is off.

Any signed-in user. Flags gate features, not data, so a non-member learns nothing by asking.
"""

from lambdas.common import flags
from lambdas.common.api import api_handler, respond, user


@api_handler("config_flags")
def handler(event, context):
    user(event)
    group_id = ((event.get("queryStringParameters") or {}).get("groupId") or "").strip() or None
    return respond(200, flags.resolved(group_id))
