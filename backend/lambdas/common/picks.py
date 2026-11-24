"""A member's picks for a week: one `PICK#sub` item, `{gameId: {team, conf}}` plus the tiebreak.

A draft may leave `team` or `conf` as None; the confidences it does hold are unique
in 1..N. `complete` means every open game has a team and a confidence, and the
tiebreak is in.
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
        if pick["conf"] is not None and not 1 <= pick["conf"] <= len(games):
            raise ValueError(f"Confidence must be 1 to {len(games)}")
    confs = [p["conf"] for p in picks.values() if p["conf"] is not None]
    if len(set(confs)) != len(confs):
        raise ValueError("Each confidence value can be used once")


def complete(picks: dict[str, dict], games: list[dict], tiebreak: int | None) -> bool:
    # validate() already tied every key to an open game, so a matching count means all of them.
    return tiebreak is not None and len(picks) == len(games) and all(p["team"] and p["conf"] for p in picks.values())


def rerank(picks: dict[str, dict], games: list[dict]) -> dict[str, dict]:
    """Fit a pick to a changed set of open games: drop closed ones and close the gaps they leave.

    Canceling the game at conf c moves every conf above c down by one. A conf a draft can
    no longer hold (above the new N) is cleared. A restored game is left unpicked, so the
    pick goes incomplete until it's saved again.
    """
    open_ids = {g["gameId"] for g in games}
    gone = [p["conf"] for gid, p in picks.items() if gid not in open_ids and p.get("conf") is not None]
    fitted = {}
    for gid, pick in picks.items():
        if gid not in open_ids:
            continue
        conf = pick.get("conf")
        if conf is not None:
            conf -= sum(c < conf for c in gone)
        fitted[gid] = {**pick, "conf": conf if conf is not None and conf <= len(games) else None}
    return fitted


def public(item: dict) -> dict:
    return {k: item.get(k) for k in ("sub", "picks", "tiebreak", "complete", "submittedAt")}
