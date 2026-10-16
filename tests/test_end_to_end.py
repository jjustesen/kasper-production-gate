"""The 30 test briefs against the hand-written answer key, plus output checks."""

import json

import pytest
from conftest import NOW, ROOT

from gate import render
from gate.__main__ import main
from gate.brain import BrainChecker
from gate.gate import Gate

EXPECTED = json.loads((ROOT / "expected" / "gate_expected.json").read_text(encoding="utf-8"))
EXPECTED.pop("_comment")
CACHE = ROOT / "cache" / "brain_cache.json"


@pytest.fixture(scope="module")
def run_result():
    import conftest

    clients = {c["client"]: c for c in json.loads((conftest.DATA / "clients.json").read_text(encoding="utf-8"))}
    briefs = json.loads((conftest.DATA / "briefs.json").read_text(encoding="utf-8"))
    brain = BrainChecker(cache_path=CACHE, live=False)
    verdicts = Gate(clients, brain, now=NOW).run(briefs)
    return {v.brief_id: v for v in verdicts}, brain


@pytest.mark.parametrize("brief_id", sorted(EXPECTED))
def test_matches_answer_key(run_result, brief_id):
    verdicts, _ = run_result
    v, want = verdicts[brief_id], EXPECTED[brief_id]
    assert v.status == want["status"], f"{brief_id}: {want['why']}"
    assert sorted({r.code for r in v.reasons}) == sorted(want["codes"]), f"{brief_id}: {want['why']}"
    assert v.approvals == want.get("approvals", [])


def test_totals(run_result):
    verdicts, brain = run_result
    assert sum(v.status == "PASS" for v in verdicts.values()) == 19
    assert brain.stats == {"cache_hits": 29, "live_calls": 0, "unchecked": 0}  # BR-22 (paused) never reaches the LLM


def test_every_block_has_a_reason_and_a_next_step(run_result):
    verdicts, _ = run_result
    for v in verdicts.values():
        if v.status != "BLOCKED":
            continue
        assert v.reasons
        if v.kind == "client":
            assert v.client_message
        elif v.kind == "approval":
            assert v.client_message_if_declined
        else:
            assert v.client_message is None  # internal: nothing goes to the client


def test_client_messages_never_leak_internal_details(run_result):
    verdicts, _ = run_result
    for v in verdicts.values():
        for msg in filter(None, [v.client_message, v.client_message_if_declined]):
            for word in ("Brain", "LLM", "invoice", "Squad Lead", "Juliana", "gate"):
                assert word not in msg, (v.brief_id, word)


def test_banned_claims_are_asked_about_once(run_result):
    verdicts, _ = run_result
    msg = verdicts["BR-19"].client_message
    assert msg.count("Could you share an alternative") == 1
    assert '"cure", "insomnia" and "clinically proven"' in msg


def test_without_cache_or_api_copy_goes_to_human_review(tmp_path):
    import conftest

    clients = {c["client"]: c for c in json.loads((conftest.DATA / "clients.json").read_text(encoding="utf-8"))}
    briefs = json.loads((conftest.DATA / "briefs.json").read_text(encoding="utf-8"))
    verdicts = {v.brief_id: v for v in Gate(clients, BrainChecker(cache_path=tmp_path / "none.json"), now=NOW).run(briefs)}
    # BR-01 is clean, but nobody checked its copy against the Brain: fail closed.
    assert verdicts["BR-01"].status == "BLOCKED"
    assert {r.code for r in verdicts["BR-01"].reasons} == {"brain_unsure"}


def test_cli_writes_all_outputs(tmp_path, capsys):
    assert main(["--out", str(tmp_path)]) == 0
    results = json.loads((tmp_path / "results.json").read_text(encoding="utf-8"))
    assert results["summary"]["blocked"] == 11
    actions = json.loads((tmp_path / "clickup_actions.json").read_text(encoding="utf-8"))
    assert {a["set_status"] for a in actions} == {"Queued", "Blocked"}
    alerts = json.loads((tmp_path / "slack" / "alerts.json").read_text(encoding="utf-8"))
    assert len(alerts) == 11 and alerts[0]["channel"].startswith("#int-")
    for squad in ("squad-a", "squad-b"):
        digest = json.loads((tmp_path / "slack" / f"digest_{squad}.json").read_text(encoding="utf-8"))
        assert digest["blocks"][0]["type"] == "header"
    assert (tmp_path / "report.md").read_text(encoding="utf-8").startswith("# Production gate run")
    html = (tmp_path / "preview.html").read_text(encoding="utf-8")
    assert '"brief_id": "BR-30"' in html and "__DATA__" not in html


def test_slug():
    assert render.slug("Ridge Outdoor") == "ridge-outdoor"
    assert render.slug("Bea A.") == "bea-a"
