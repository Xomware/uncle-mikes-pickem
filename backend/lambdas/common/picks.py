"""A member's picks for a week: one `PICK#sub` item, `{gameId: {team, conf}}` plus the tiebreak.

Every game in a draft carries a confidence, so a draft is always a valid ranking;
`team` stays None until it's picked. `complete` means every open game has a team
and the tiebreak is in.
"""


def validate(picks: dict[str, dict], games: list[dict]) -> None:
    """Raise ValueError unless each pick is an open game, a team in it, and a confidence unique in 1..N."""
    by_id = {g["gameId"]: g for g in games}
    for game_id, pick in picks.items():
        game = by_id.get(game_id)
        if not game:
            raise ValueError(f"Game {game_id} isn't open for picks this week")
        if pick["team"] is not None and pick["team"] not in (game["away"]["abbr"], game["home"]["abbr"]):
            raise ValueError(f"{pick['team']} isn't playing in game {game_id}")
        if not 1 <= pick["conf"] <= len(games):
            raise ValueError(f"Confidence must be 1 to {len(games)}")
    confs = [p["conf"] for p in picks.values()]
    if len(set(confs)) != len(confs):
        raise ValueError("Each confidence value can be used once")


def complete(picks: dict[str, dict], games: list[dict], tiebreak: int | None) -> bool:
    # validate() already tied every key to an open game, so a matching count means all of them.
    return tiebreak is not None and len(picks) == len(games) and all(p["team"] for p in picks.values())


def public(item: dict) -> dict:
    return {k: item.get(k) for k in ("sub", "picks", "tiebreak", "complete", "submittedAt")}
