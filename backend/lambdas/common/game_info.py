"""ESPN's game summary distilled to what the game page shows (F12).

Field notes are in docs/features/nfl-data-sources/RESEARCH.md. Headshots and logos
stay ESPN URLs; the browser loads them, nothing is stored or committed.
"""

from __future__ import annotations

# Out first: those are the ones that change a pick. IR is long-term background.
SEVERITY = {"Out": 0, "Doubtful": 1, "Questionable": 2, "IR": 3}
UNSPECIFIED = "Not Specified"


def headshot_url(athlete_id: str) -> str:
    return f"https://a.espncdn.com/i/headshots/nfl/players/full/{athlete_id}.png"


def injury(row: dict) -> dict:
    athlete = row["athlete"]
    details = row.get("details") or {}
    status = "IR" if row["status"] == "Injured Reserve" else row["status"]
    # "Hamstring, Strain"; ESPN fills unknown parts with "Not Specified", and some rows have no details at all.
    parts = [details.get(k) for k in ("type", "detail", "side")]
    detail = ", ".join(dict.fromkeys(p for p in parts if p and p != UNSPECIFIED))
    return {
        "name": athlete["displayName"],
        "position": (athlete.get("position") or {}).get("abbreviation"),
        "status": status,
        "detail": detail or None,
        "returnDate": details.get("returnDate"),
        "headshot": (athlete.get("headshot") or {}).get("href") or headshot_url(athlete["id"]),
    }


def form(events: list[dict]) -> list[dict]:
    """Last five, oldest first as ESPN sends them."""
    return [
        {"week": e["week"], "atVs": e["atVs"], "opponent": e["opponent"]["abbreviation"], "result": e["gameResult"], "score": e["score"]}
        for e in events
    ]


def team(competitor: dict, summary: dict) -> dict:
    abbr = competitor["team"]["abbreviation"]
    records = {r["type"]: r["summary"] for r in competitor.get("record", [])}
    last5 = next((t["events"] for t in summary.get("lastFiveGames", []) if t["team"]["abbreviation"] == abbr), [])
    hurt = next((t["injuries"] for t in summary.get("injuries", []) if t["team"]["abbreviation"] == abbr), [])
    return {
        "name": competitor["team"].get("displayName"),
        "record": records.get("total"),
        "split": records.get("home" if competitor["homeAway"] == "home" else "road"),
        "form": form(last5),
        "injuries": sorted((injury(i) for i in hurt), key=lambda i: SEVERITY.get(i["status"], len(SEVERITY))),
    }


def odds(pick: dict) -> dict:
    """pickcenter carries flat moneylines, which scoreboard snapshots lack."""
    return {
        "provider": (pick.get("provider") or {}).get("name"),
        "details": pick.get("details"),
        "spread": pick.get("spread"),
        "overUnder": pick.get("overUnder"),
        "homeMoneyline": (pick.get("homeTeamOdds") or {}).get("moneyLine"),
        "awayMoneyline": (pick.get("awayTeamOdds") or {}).get("moneyLine"),
    }


def distill(summary: dict) -> dict:
    info = summary.get("gameInfo") or {}
    venue = info.get("venue") or {}
    weather = info.get("weather")
    competitors = summary["header"]["competitions"][0]["competitors"]
    return {
        "teams": {c["team"]["abbreviation"]: team(c, summary) for c in competitors},
        "odds": odds(summary["pickcenter"][0]) if summary.get("pickcenter") else None,
        "venue": {
            "name": venue.get("fullName"),
            "city": (venue.get("address") or {}).get("city"),
            "state": (venue.get("address") or {}).get("state"),
            "grass": venue.get("grass"),
        },
        # ESPN reports weather for domes too; the handler drops it by roof.
        "weather": weather
        and {
            "temperature": weather.get("temperature"),
            "high": weather.get("highTemperature"),
            "low": weather.get("lowTemperature"),
            "gust": weather.get("gust"),
            # Units unverified (RESEARCH.md open question); probably percent chance.
            "precipitation": weather.get("precipitation"),
        },
        "broadcasts": [b["media"]["shortName"] for b in summary.get("broadcasts", []) if b.get("media")],
    }
