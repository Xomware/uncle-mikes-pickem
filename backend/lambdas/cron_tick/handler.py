"""pickem-cron-tick: keeps pickem-nfl's WEEK and GAME items current from ESPN.

Scheduled every 2 minutes. A tick works only inside a game window (live: the
current week) or on the hourly refresh (current and next week, so Tuesday's
GOW pick has next week's games). A game ESPN calls final keeps the window open
until nflverse confirms it or it is flagged (common/finals.py). The 15:00Z
hourly refresh also fetches ESPN's predictor for hype. {"force": true} runs that refresh now. Hourly and forced
ticks then set the top-hype GOW for any group still without one past Tuesday noon ET.
A tick that changes a final regrades those weeks for every live group of the season;
hourly and forced ticks regrade every locked week of every current group, which is
what picks up replay clocks, new members and death picks (common/results.py).
Every tick that works writes a poll row to pickem-ops.
"""

from __future__ import annotations

import functools
import json
import os
from datetime import datetime, timedelta, timezone

import boto3
from boto3.dynamodb.conditions import Attr

from lambdas.common import espn, finals, gow, hype, nfl_store, nflverse, results, weeks

WINDOW_BEFORE = timedelta(minutes=15)
# A suspended or postponed game never completes; don't let it hold the window open.
WINDOW_AFTER = timedelta(hours=6)
RUN_TTL = timedelta(days=30)
# ESPN's predictor updates around 10:00Z; one fetch a day after that is enough.
PREDICTOR_HOUR = 15
REGULAR = 2
LAST_WEEK = 18

dynamodb = boto3.resource("dynamodb")


def parse(ts: str) -> datetime:
    """ESPN writes "2026-11-13T01:15Z"; nfl_store.iso adds seconds."""
    return datetime.fromisoformat(ts.replace("Z", "+00:00"))


def choose_mode(now: datetime, games: list[dict], force: bool) -> str | None:
    if force:
        return "force"
    # rate(2 minutes) puts exactly one tick in the first two minutes of each hour.
    if now.minute < 2:
        return "hourly"
    for g in games:
        kickoff = parse(g["kickoff"])
        if not g["completed"] and kickoff - WINDOW_BEFORE <= now < kickoff + WINDOW_AFTER:
            return "live"
        if g["completed"] and not finals.settled(g):
            return "live"
    return None


def target_weeks(season_type: int, week: int, mode: str) -> list[int]:
    if season_type == 1:  # preseason: get Week 1 in place before it starts
        return [1]
    if season_type != REGULAR:
        return []
    if mode == "live":
        return [week]
    return [week, week + 1] if week < LAST_WEEK else [week]


def lines(odds: dict) -> dict:
    """ESPN's sign convention: spread is the home team's line, negative when home is favored."""
    ml = odds.get("moneyline") or {}

    def american(side: str) -> int | None:
        price = ((ml.get(side) or {}).get("close") or {}).get("odds")
        if price is None:
            return None
        return 100 if price == "EVEN" else int(price)

    return {
        "provider": odds["provider"]["name"],
        "details": odds.get("details"),
        "spread": odds.get("spread"),
        "overUnder": odds.get("overUnder"),
        "homeMoneyline": american("home"),
        "awayMoneyline": american("away"),
    }


def game_fields(event: dict) -> dict:
    c = event["competitions"][0]
    status = c["status"]["type"]
    scores = {t["homeAway"]: t.get("score") for t in c["competitors"]}
    teams = {t["homeAway"]: nfl_store.team(t["team"]) for t in c["competitors"]}
    venue = c["venue"]
    started = status["state"] != "pre"
    game = {
        "gameId": event["id"],
        "kickoff": nfl_store.iso(parse(c["date"])),
        # False while the NFL hasn't set the time (Week 18 until Week 17 ends); kickoff is a placeholder.
        "timeValid": c.get("timeValid", True),
        "status": status["name"],
        "state": status["state"],
        "completed": status["completed"],
        "away": teams["away"],
        "home": teams["home"],
        "venue": {"id": venue["id"], "name": venue["fullName"], "indoor": venue.get("indoor")},
        "neutralSite": c["neutralSite"],
        "broadcasts": [n for b in c.get("broadcasts", []) for n in b["names"]],
        # ESPN sends "0" before kickoff; a score means nothing until the game starts.
        "awayScore": int(scores["away"]) if started else None,
        "homeScore": int(scores["home"]) if started else None,
    }
    if status["completed"]:
        winner = [t["team"]["abbreviation"] for t in c["competitors"] if t.get("winner")]
        game["winner"] = winner[0] if winner else None
        game["tie"] = not winner
    # Only before kickoff, so the stored line is the closing line.
    if status["state"] == "pre" and c.get("odds"):
        game["lines"] = lines(c["odds"][0])
    # The forecast as of kickoff; the summary's gameInfo.weather has numbers but no description.
    if status["state"] == "pre" and event.get("weather"):
        game["weather"] = {k: event["weather"].get(k) for k in ("displayValue", "temperature", "conditionId")}
    return game


def scoreboard(season: int | None = None, week: int | None = None) -> dict:
    url = f"{espn.SITE}/scoreboard"
    if week is not None:
        url += f"?seasontype={REGULAR}&week={week}&dates={season}"
    status, body = espn.get(url)
    if status != 200:
        raise RuntimeError(f"{url} returned {status}")
    return json.loads(body)


def matchup_quality(game_id: str) -> float | None:
    """None when ESPN has no predictor for the game; the stored value is then kept."""
    status, body = espn.get(f"{espn.CORE}/events/{game_id}/competitions/{game_id}/predictor")
    if status != 200:
        return None
    stats = json.loads(body)["homeTeam"]["statistics"]
    return next((s["value"] for s in stats if s["name"] == "matchupQuality"), None)


def confirm(game: dict, stored: dict, verse, now: datetime) -> str | None:
    """Apply finals.check to a completed game. Returns the alert text when it is newly flagged."""
    if not game["completed"] or finals.confirmed(stored):
        return None
    game.update(finals.check({**stored, **game}, verse().get(game["gameId"]), now))
    if game.get("flag") and game["flag"] != stored.get("flag"):
        return f"{game['away']['abbr']} @ {game['home']['abbr']} ({game['gameId']}): {game['flag']}"
    return None


def final_state(game: dict) -> tuple | None:
    """What grading reads from a game: a change here means its week needs a regrade."""
    if not game.get("completed"):
        return None
    return game["awayScore"], game["homeScore"], finals.confirmed(game)


def alert(season: int, week: int, problems: list[str]) -> None:
    boto3.client("sns").publish(
        TopicArn=os.environ["ALARMS_TOPIC_ARN"],
        Subject=f"Pick Em: {season} Week {week} final needs a look",
        Message="\n".join(problems) + "\n\nGrading holds these games provisional. POST /results/override settles one.",
    )


def refresh_week(season: int, week: int, board: dict, now: datetime, predictors: bool, verse) -> dict:
    """Write the week's games and WEEK item, confirming finals against nflverse."""
    stored = {g["gameId"]: g for g in nfl_store.list_games(season, week)}
    games = [game_fields(e) for e in board["events"]]
    missed = []
    for g in games:
        if not predictors or g["state"] != "pre":
            continue
        mq = matchup_quality(g["gameId"])
        if mq is None:
            missed.append(g["gameId"])
        else:
            g["matchupQuality"] = mq

    standalone = hype.standalone_ids(games)
    flagged, changed = [], False
    for g in games:
        before = stored.get(g["gameId"], {})
        # Hourly refreshes carry no predictor, and live ones no line: take those from the stored item.
        g["hype"] = hype.hype({**before, **g}, g["gameId"] in standalone)
        problem = confirm(g, before, verse, now)
        if problem:
            flagged.append(problem)
        if final_state(before) != final_state({**before, **g}):
            changed = True
        nfl_store.save_game(season, week, g)
    if games:
        lock_at, tiebreak = nfl_store.week_fields(games)
        nfl_store.save_week(season, week, lock_at, tiebreak, [g["gameId"] for g in games], nfl_store.iso(now))
    if flagged:
        alert(season, week, flagged)
    return {"games": len(games), "predictorMissing": missed, "flagged": flagged, "finalsChanged": [week] if changed else []}


def refresh(now: datetime, mode: str) -> dict:
    board = scoreboard()
    season, season_type, current = board["season"]["year"], board["season"]["type"], board["week"]["number"]
    weeks = target_weeks(season_type, current, mode)
    if weeks:
        nfl_store.set_current(season, weeks[0])
    predictors = mode == "force" or (mode == "hourly" and now.hour == PREDICTOR_HOUR)
    # Fetched at most once a tick, and only when a final is waiting on it.
    verse = functools.cache(lambda: nflverse.games(nflverse.fetch(), season))
    out = {"season": season, "weeks": weeks, "games": 0, "predictorMissing": [], "flagged": [], "finalsChanged": []}
    for week in weeks:
        same = season_type == REGULAR and week == current
        done = refresh_week(season, week, board if same else scoreboard(season, week), now, predictors, verse)
        for key in ("games", "predictorMissing", "flagged", "finalsChanged"):
            out[key] += done[key]
    return out


def all_groups(table):
    # INVITE#code items also use SK META.
    kwargs = {"FilterExpression": Attr("SK").eq("META") & Attr("PK").begins_with("GROUP#")}
    while True:
        page = table.scan(**kwargs)
        yield from page["Items"]
        if "LastEvaluatedKey" not in page:
            return
        kwargs["ExclusiveStartKey"] = page["LastEvaluatedKey"]


def auto_gow() -> list[str]:
    """Set the top-hype GOW for each group past its next week's Tuesday deadline without one.

    Each group is judged on its own feed, so a replay group's deadline and lock run on
    its virtual clock. Returns "<group>#W<nn>" for each GOW set.
    """
    table = dynamodb.Table(os.environ["APP_TABLE"])
    chosen = []
    for group in all_groups(table):
        feed = nfl_store.for_group(group)
        n = (feed.last_locked_week() or 0) + 1
        week = feed.week(n)
        if not week or not gow.deadline(week["lockAt"]) <= feed.now < nfl_store.parse(week["lockAt"]):
            continue
        pk = weeks.week_pk(group["groupId"], feed.season, n)
        canceled = weeks.canceled_ids(table, pk)
        top = gow.top_game([g for g in feed.games(n) if g["gameId"] not in canceled])
        try:
            table.put_item(
                Item=gow.item(pk, top["gameId"], "auto", nfl_store.iso(feed.now)),
                ConditionExpression="attribute_not_exists(SK)",
            )
        except table.meta.client.exceptions.ConditionalCheckFailedException:
            continue  # the organizer already chose
        chosen.append(f"{group['groupId']}#W{n:02d}")
    return chosen


def regrade_groups(season: int, changed: list[int], sweep: bool) -> dict[str, list[int]]:
    """Regrade `changed` weeks for the season's live groups, or with `sweep` every locked week of
    every current group (replays included). Returns {groupId: weeks rewritten} where any were."""
    table = dynamodb.Table(os.environ["APP_TABLE"])
    out = {}
    for group in all_groups(table):
        replay = bool(group.get("replay"))
        if not replay and int(group["season"]) != season:
            continue
        if sweep:
            done = results.regrade(table, group)
        elif changed and not replay:
            done = results.regrade(table, group, changed)
        else:
            continue
        if done["weeks"]:
            out[group["groupId"]] = done["weeks"]
    return out


def record_run(now: datetime, mode: str, result: dict) -> None:
    dynamodb.Table(os.environ["OPS_TABLE"]).put_item(
        Item={
            "PK": "POLL#cron_tick",
            "SK": nfl_store.iso(now),
            "mode": mode,
            **result,
            "ttl": int((now + RUN_TTL).timestamp()),
        }
    )


def handler(event, context):
    now = datetime.now(timezone.utc)
    current = nfl_store.current_week()
    games = nfl_store.list_games(*current) if current else []
    mode = choose_mode(now, games, bool((event or {}).get("force")))
    if mode is None:
        return {"mode": None}

    try:
        result = refresh(now, mode)
        if mode != "live":
            result["gowAuto"] = auto_gow()
        result["regraded"] = regrade_groups(result["season"], result["finalsChanged"], sweep=mode != "live")
    except Exception as e:
        # The failed run is the row someone goes looking for; re-raise so Errors fires.
        record_run(now, mode, {"error": f"{type(e).__name__}: {e}"})
        raise
    record_run(now, mode, result)
    return {"mode": mode, **result}
