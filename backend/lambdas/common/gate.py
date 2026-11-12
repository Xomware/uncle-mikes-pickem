"""Pick visibility. The API is the only gate: the client never receives picks it may not show."""


def visible_picks(items: list[dict], sub: str, locked: bool) -> list[dict]:
    """The caller's own PICK item before lock, everyone's after."""
    return [i for i in items if i["SK"].startswith("PICK#") and (locked or i["sub"] == sub)]
