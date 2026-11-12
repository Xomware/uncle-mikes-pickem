import gzip
import json
import os
from datetime import datetime, timedelta, timezone

import boto3

from lambdas.common import espn

PREKICK_WINDOW = timedelta(minutes=45)
s3 = boto3.client("s3")


def choose_mode(now: datetime, events: list[dict], force: bool) -> str | None:
    if force:
        return "force"
    # The scheduler fires every 30 minutes, so exactly one tick lands in 14:00-14:29.
    if now.hour == 14 and now.minute < 30:
        return "daily"
    for e in events:
        kickoff = datetime.fromisoformat(e["date"].replace("Z", "+00:00"))
        if e["status"]["type"]["state"] == "pre" and now < kickoff <= now + PREKICK_WINDOW:
            return "prekick"
    return None


def sources(season: int, events: list[dict], mode: str) -> dict[str, str]:
    urls = {f"summary-{e['id']}": f"{espn.SITE}/summary?event={e['id']}" for e in events}
    urls["gambit-pickem"] = f"{espn.GAMBIT}/nfl-pickem-{season}"
    urls["gambit-survivor"] = f"{espn.GAMBIT}/nfl-survivor-{season}"
    if mode != "prekick":
        urls["injuries"] = f"{espn.SITE}/injuries"
        urls["standings"] = espn.STANDINGS
    return urls


def put(key: str, body: bytes) -> None:
    s3.put_object(
        Bucket=os.environ["CAPTURE_BUCKET"],
        Key=key,
        Body=gzip.compress(body),
        ContentType="application/json",
        ContentEncoding="gzip",
    )


def handler(event, context):
    now = datetime.now(timezone.utc)
    status, body = espn.get(f"{espn.SITE}/scoreboard")
    if status != 200:
        raise RuntimeError(f"scoreboard returned {status}")
    board = json.loads(body)
    events = board["events"]

    mode = choose_mode(now, events, bool((event or {}).get("force")))
    if mode is None:
        return {"mode": None}

    season = board["season"]["year"]
    prefix = (
        f"raw/season={season}/type={board['season']['type']}/week={board['week']['number']:02d}/"
        f"{now.strftime('%Y-%m-%dT%H%M%SZ')}"
    )
    put(f"{prefix}/scoreboard.json.gz", body)

    manifest = {"mode": mode, "capturedAt": now.isoformat(), "files": []}
    failed = []
    for name, url in sources(season, events, mode).items():
        status, data = espn.get(url)
        entry = {"name": name, "url": url, "status": status, "bytes": len(data)}
        manifest["files"].append(entry)
        if status != 200:
            failed.append(entry)
            continue
        put(f"{prefix}/{name}.json.gz", data)

    put(f"{prefix}/manifest.json.gz", json.dumps(manifest).encode())
    # Raised after writing so the good files are kept and the Errors alarm fires.
    if failed:
        raise RuntimeError(f"{len(failed)} fetches failed: {failed}")
    return {"mode": mode, "prefix": prefix, "files": len(manifest["files"]) + 1}
