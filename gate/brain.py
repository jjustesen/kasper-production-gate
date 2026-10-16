"""Rule 6, Brain rules: does this copy break a client's free-text brand rule?

This is the only step that needs language understanding ("never a generic
cup", "no superlatives we can't prove"), so it is the only LLM step. It uses a
cheap model through a content-addressed cache:

  1. Look up sha256(model, client, rules, copy) in the cache file. Re-checking
     an unchanged brief costs nothing.
  2. On a miss, call the model if live calls are enabled, then cache the answer.
  3. On a miss with no live calls (or an API error), answer "unsure" for every
     rule. The gate turns "unsure" into a block for human review: failing
     closed is safer than letting unchecked copy into production.

The model only says violates / ok / unsure and quotes the offending words.
It never decides numbers: discount caps are checked in code (claims.py).
"""

import hashlib
import json
from pathlib import Path

from . import config
from .models import BrainVerdict

SYSTEM_PROMPT = """You check ad copy briefs against a client's brand rules.
For each rule, answer:
- "violates": the copy clearly breaks the rule. Quote the exact words in evidence.
- "ok": the copy does not break the rule. Mentioning nothing about the rule is ok.
- "unsure": you cannot tell from the copy alone.
Ignore numeric limits such as discount caps; they are checked elsewhere, so answer "ok" for them.
The copy may be in English or Portuguese. Judge meaning, not keywords."""

RESPONSE_SCHEMA = {
    "type": "object",
    "properties": {
        "verdicts": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "rule_index": {"type": "integer"},
                    "verdict": {"type": "string", "enum": ["violates", "ok", "unsure"]},
                    "evidence": {"type": "string"},
                },
                "required": ["rule_index", "verdict", "evidence"],
                "additionalProperties": False,
            },
        }
    },
    "required": ["verdicts"],
    "additionalProperties": False,
}


def cache_key(model: str, client: str, rules: list[str], text: str) -> str:
    payload = json.dumps([model, client, rules, text], ensure_ascii=False)
    return hashlib.sha256(payload.encode("utf-8")).hexdigest()


class BrainChecker:
    def __init__(self, cache_path: Path | None = None, live: bool = False, model: str = config.BRAIN_MODEL, client=None):
        self.cache_path = cache_path
        self.live = live
        self.model = model
        self._client = client  # an anthropic.Anthropic, injected in tests
        self.stats = {"cache_hits": 0, "live_calls": 0, "unchecked": 0}
        self._cache: dict[str, dict] = {}
        if cache_path and cache_path.exists():
            for entry in json.loads(cache_path.read_text(encoding="utf-8")):
                key = cache_key(entry["model"], entry["client"], entry["rules"], entry["text"])
                self._cache[key] = entry

    def check(self, client: str, text: str, rules: list[str]) -> tuple[list[BrainVerdict], str]:
        """Return (one verdict per rule, where the answer came from)."""
        key = cache_key(self.model, client, rules, text)
        if key in self._cache:
            self.stats["cache_hits"] += 1
            entry = self._cache[key]
            return [BrainVerdict(**v) for v in entry["verdicts"]], f"cache ({entry['source']})"

        if self.live:
            try:
                verdicts = self._ask_model(text, rules)
            except Exception as exc:  # any API failure fails closed
                return self._unchecked(rules, f"API error: {exc.__class__.__name__}")
            self.stats["live_calls"] += 1
            self._store(key, client, text, rules, verdicts)
            return verdicts, self.model

        return self._unchecked(rules, "no cached answer and live calls are off")

    def _unchecked(self, rules: list[str], why: str) -> tuple[list[BrainVerdict], str]:
        self.stats["unchecked"] += 1
        return [BrainVerdict(rule=r, verdict="unsure", evidence=why) for r in rules], "unchecked"

    def _ask_model(self, text: str, rules: list[str]) -> list[BrainVerdict]:
        if self._client is None:
            import anthropic  # optional dependency, only needed for live calls

            self._client = anthropic.Anthropic()
        numbered = "\n".join(f"{i}. {rule}" for i, rule in enumerate(rules))
        response = self._client.messages.create(
            model=self.model,
            max_tokens=config.BRAIN_MAX_TOKENS,
            system=SYSTEM_PROMPT,
            output_config={"effort": "low", "format": {"type": "json_schema", "schema": RESPONSE_SCHEMA}},
            messages=[{"role": "user", "content": f"Brand rules:\n{numbered}\n\nCopy:\n{text}"}],
        )
        if response.stop_reason != "end_turn":
            raise RuntimeError(f"unexpected stop_reason {response.stop_reason}")
        data = json.loads(next(b.text for b in response.content if b.type == "text"))
        by_index = {v["rule_index"]: v for v in data["verdicts"]}
        # A rule the model skipped is "unsure", never silently "ok".
        return [
            BrainVerdict(rule=rule, verdict=by_index[i]["verdict"], evidence=by_index[i]["evidence"])
            if i in by_index
            else BrainVerdict(rule=rule, verdict="unsure", evidence="model gave no answer for this rule")
            for i, rule in enumerate(rules)
        ]

    def _store(self, key: str, client: str, text: str, rules: list[str], verdicts: list[BrainVerdict]) -> None:
        entry = {
            "model": self.model, "client": client, "rules": rules, "text": text, "source": self.model,
            "verdicts": [vars(v) for v in verdicts],
        }
        self._cache[key] = entry
        if self.cache_path:
            self.cache_path.write_text(
                json.dumps(list(self._cache.values()), ensure_ascii=False, indent=1), encoding="utf-8"
            )
