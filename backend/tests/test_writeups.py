"""Film Room write-ups. UPDATE_GOLDEN=1 rewrites the fact pack and prompt goldens; review the diff."""

import json
import os
from pathlib import Path
from types import SimpleNamespace

import anthropic
import boto3
import httpx2
import pytest

from lambdas.common import espn, game_view, nfl_store, nflverse, writeup
from tests.test_games_info import CSV, SUMMARY, TNF, seed_live

GOLDEN = Path(__file__).parent / "golden" / "writeups"
TEXT = "Washington visits the Giants with both sides banged up. Upset watch: Washington keeps it close."


class FakeMessages:
    def __init__(self):
        self.calls, self.reply = [], None

    def create(self, **kwargs):
        self.calls.append(kwargs)
        if isinstance(self.reply, Exception):
            raise self.reply
        return self.reply or SimpleNamespace(
            stop_reason="end_turn",
            content=[SimpleNamespace(type="thinking", thinking=""), SimpleNamespace(type="text", text=TEXT)],
        )


@pytest.fixture
def run(app, monkeypatch):
    monkeypatch.setenv("ANTHROPIC_KEY_PARAM", "/pickem/anthropic-api-key")
    boto3.client("ssm").put_parameter(Name="/pickem/anthropic-api-key", Value="sk-test", Type="SecureString")
    from lambdas.writeups import handler as module

    monkeypatch.setattr(nflverse, "fetch", lambda: CSV)
    monkeypatch.setattr(espn, "get", lambda url: (200, SUMMARY))
    monkeypatch.setattr(module.clock, "now", lambda group=None: nfl_store.parse("2026-11-12T15:00:00Z"))
    fake = FakeMessages()
    keys = []

    def client(api_key):
        keys.append(api_key)
        return SimpleNamespace(messages=fake)

    monkeypatch.setattr(module.anthropic, "Anthropic", client)
    seed_live()
    nfl_store.set_current(2026, 10)

    def go(event=None):
        return module.handler(event or {}, None)

    go.messages, go.keys = fake, keys
    return go


def golden(name: str, body: str):
    path = GOLDEN / name
    if os.environ.get("UPDATE_GOLDEN"):
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(body)
    assert body == path.read_text(), f"{name} changed; rerun with UPDATE_GOLDEN=1 if intended"


def test_fact_pack_and_prompt_match_golden(run):
    assert run() == {"written": 1}
    call = run.messages.calls[0]
    assert run.keys == ["sk-test"]
    assert (call["model"], call["output_config"]) == ("claude-haiku-5-5", {"effort": "low"})
    assert "temperature" not in call and "thinking" not in call
    golden("system.txt", call["system"])
    golden("prompt-401873052.txt", call["messages"][0]["content"])


def test_fact_pack_drops_ir_and_keeps_the_line(run):
    run()
    facts = json.loads(run.messages.calls[0]["messages"][0]["content"].removeprefix("Fact pack:\n"))
    assert facts["kickoff"] == "Thu Nov 12, 8:15 PM ET"
    assert facts["line"]["favorite"] == "NYG -2.5"
    assert "IR" not in {i["status"] for i in facts["home"]["injuries"]}
    assert facts["weather"]["conditions"] == "Showers"
    assert facts["headToHead"] == ["2026 week 5: NYG 27 @ WSH 27"]


def test_stores_the_writeup_with_model_and_time(run):
    run()
    item = writeup.get(TNF)
    assert (item["text"], item["model"], item["generatedAt"]) == (TEXT, "claude-haiku-5-5", "2026-11-12T15:00:00Z")


def test_unchanged_facts_skip_unless_forced(run):
    run()
    assert run() == {"unchanged": 1}
    assert run({"force": True, "season": 2026, "week": 10}) == {"written": 1}
    assert len(run.messages.calls) == 2


def test_changed_facts_rewrite(run, monkeypatch):
    run()
    monkeypatch.setattr(game_view, "CACHE_FOR", game_view.CACHE_FOR * 0)
    monkeypatch.setattr(nflverse, "fetch", lambda: CSV.replace(",outdoors,", ",dome,"))
    assert run() == {"written": 1}


def test_started_games_are_left_alone(run):
    nfl_store.save_game(2026, 10, {"gameId": TNF, "state": "in"})
    assert run() == {"started": 1}
    assert run.messages.calls == []


def test_refusal_stores_nothing(run):
    run.messages.reply = SimpleNamespace(stop_reason="refusal", content=[])
    assert run() == {"refused": 1}
    assert writeup.get(TNF) is None


def test_emoji_is_stripped(run):
    run.messages.reply = SimpleNamespace(stop_reason="end_turn", content=[SimpleNamespace(type="text", text="Lock of the week: Giants. \U0001F512")])
    run()
    assert writeup.get(TNF)["text"] == "Lock of the week: Giants."


def test_api_failure_raises_after_the_week(run):
    request = httpx2.Request("POST", "https://api.anthropic.com/v1/messages")
    run.messages.reply = anthropic.APIConnectionError(request=request)
    with pytest.raises(RuntimeError, match="1 write-ups failed"):
        run()
    assert writeup.get(TNF) is None


def test_no_current_week_is_a_no_op(run):
    nfl_store.table().delete_item(Key={"PK": "CURRENT", "SK": "WEEK"})
    assert run() == {}
