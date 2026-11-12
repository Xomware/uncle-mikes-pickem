"""Golden HTML and text per preview sample. UPDATE_GOLDEN=1 rewrites them; review the diff, and the PNGs."""

import os
from pathlib import Path

import pytest

from lambdas.common.email_samples import SAMPLES

GOLDEN = Path(__file__).parent / "golden" / "emails"


@pytest.fixture
def render(monkeypatch):
    monkeypatch.setenv("SITE_URL", "https://pickem.xomware.com")
    from lambdas.common import mailer

    def go(sample):
        template, ctx = SAMPLES[sample]
        return mailer.render(template, {**ctx, "name": "Pat", "group_name": "Sunday Crew"}, "https://api.test/unsub")

    return go


@pytest.mark.parametrize("sample", sorted(SAMPLES))
def test_matches_golden(render, sample):
    email = render(sample)
    got = {"html": f"<!-- subject: {email.subject} -->\n{email.html}", "txt": email.text}
    for ext, body in got.items():
        path = GOLDEN / f"{sample}.{ext}"
        if os.environ.get("UPDATE_GOLDEN"):
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_text(body)
        assert body == path.read_text(), f"{path.name} changed; rerun with UPDATE_GOLDEN=1 if intended"


@pytest.mark.parametrize("sample", sorted(SAMPLES))
def test_text_part_has_no_markup(render, sample):
    assert "<" not in render(sample).text
