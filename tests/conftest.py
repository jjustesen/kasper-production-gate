import copy
import json
import sys
from datetime import datetime, timezone
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

from gate.models import BrainVerdict  # noqa: E402

DATA = ROOT / "data" / "option_b_gate"
NOW = datetime(2026, 10, 13, 9, 0, tzinfo=timezone.utc)  # Tuesday


class FakeBrain:
    """Brain checker stub: 'ok' for every rule unless told otherwise."""

    def __init__(self, answers: dict[str, str] | None = None):
        self.answers = answers or {}  # rule -> "violates" | "unsure"
        self.calls = 0

    def check(self, client, text, rules):
        self.calls += 1
        return [BrainVerdict(rule=r, verdict=self.answers.get(r, "ok"), evidence=text[:40]) for r in rules], "fake"


@pytest.fixture
def clients():
    data = json.loads((DATA / "clients.json").read_text(encoding="utf-8"))
    return {c["client"]: c for c in data}


@pytest.fixture
def briefs():
    return json.loads((DATA / "briefs.json").read_text(encoding="utf-8"))


@pytest.fixture
def make_brief():
    """A clean, passing Northpeak statics brief; override fields per test."""
    base = {
        "id": "T-01",
        "client": "Northpeak Coffee",
        "title": "Test brief",
        "created_at": "2026-10-12T08:00:00Z",
        "platforms": ["Meta"],
        "formats": ["4:5"],
        "deliverables": {"statics": 1, "videos": 0},
        "due_date": "2026-10-20",
        "products": ["NP-CB-ORG"],
        "copy_direction": "Cold brew, ready when you are.",
        "assets_link": "https://drive.google.com/drive/folders/x",
        "use_studio_catalog": False,
        "notes": "",
        "comments": [],
    }

    def make(**overrides):
        brief = copy.deepcopy(base)
        brief.update(overrides)
        return brief

    return make
