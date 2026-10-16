"""The Brain checker: cache, fail-closed behaviour and parsing the model reply (API mocked)."""

import json
from types import SimpleNamespace

from gate.brain import BrainChecker

RULES = ["Always show the can or bag, never a generic cup.", "No superlatives we can't prove."]


class FakeMessages:
    def __init__(self, payload, stop_reason="end_turn"):
        self.payload, self.stop_reason, self.calls = payload, stop_reason, []

    def create(self, **kwargs):
        self.calls.append(kwargs)
        return SimpleNamespace(
            stop_reason=self.stop_reason,
            content=[SimpleNamespace(type="text", text=json.dumps(self.payload))],
        )


def fake_client(payload, **kw):
    return SimpleNamespace(messages=FakeMessages(payload, **kw))


def test_live_call_is_parsed_and_cached(tmp_path):
    payload = {"verdicts": [
        {"rule_index": 0, "verdict": "violates", "evidence": "takeaway cup"},
        {"rule_index": 1, "verdict": "ok", "evidence": ""},
    ]}
    client = fake_client(payload)
    cache = tmp_path / "cache.json"
    checker = BrainChecker(cache_path=cache, live=True, client=client)

    verdicts, source = checker.check("Northpeak Coffee", "pour into a takeaway cup", RULES)
    assert [v.verdict for v in verdicts] == ["violates", "ok"] and source == "claude-haiku-5-5"

    request = client.messages.calls[0]
    assert request["model"] == "claude-haiku-5-5"
    assert request["output_config"]["format"]["type"] == "json_schema"

    # Same copy, same rules: answered from the cache file, no second call.
    again = BrainChecker(cache_path=cache, live=True, client=client)
    assert again.check("Northpeak Coffee", "pour into a takeaway cup", RULES)[1].startswith("cache")
    assert len(client.messages.calls) == 1


def test_changed_copy_or_rules_misses_the_cache(tmp_path):
    payload = {"verdicts": [{"rule_index": 0, "verdict": "ok", "evidence": ""}, {"rule_index": 1, "verdict": "ok", "evidence": ""}]}
    client = fake_client(payload)
    checker = BrainChecker(cache_path=tmp_path / "c.json", live=True, client=client)
    checker.check("Northpeak Coffee", "copy v1", RULES)
    checker.check("Northpeak Coffee", "copy v2", RULES)
    checker.check("Northpeak Coffee", "copy v2", RULES[:1])
    assert len(client.messages.calls) == 3


def test_rule_the_model_skipped_is_unsure_not_ok(tmp_path):
    client = fake_client({"verdicts": [{"rule_index": 0, "verdict": "ok", "evidence": ""}]})
    verdicts, _ = BrainChecker(live=True, client=client).check("Northpeak Coffee", "copy", RULES)
    assert [v.verdict for v in verdicts] == ["ok", "unsure"]


def test_api_error_or_truncated_reply_fails_closed():
    class Boom:
        def create(self, **kwargs):
            raise TimeoutError

    for client in (SimpleNamespace(messages=Boom()), fake_client({}, stop_reason="max_tokens")):
        verdicts, source = BrainChecker(live=True, client=client).check("Northpeak Coffee", "copy", RULES)
        assert source == "unchecked" and {v.verdict for v in verdicts} == {"unsure"}


def test_offline_cache_miss_is_unsure():
    checker = BrainChecker(live=False)
    verdicts, source = checker.check("Northpeak Coffee", "copy", RULES)
    assert source == "unchecked" and checker.stats["unchecked"] == 1
    assert all(v.verdict == "unsure" for v in verdicts)
