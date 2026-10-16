// The Brain checker: cache, fail-closed behaviour and parsing the model reply (API mocked).

import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, it } from "vitest";
import { BrainChecker, type MessagesClient } from "../src/brain.ts";

const RULES = ["Always show the can or bag, never a generic cup.", "No superlatives we can't prove."];
const tmpFile = (name: string) => join(mkdtempSync(join(tmpdir(), "brain-")), name);

/** A fake Anthropic client that returns a fixed JSON reply and records requests. */
function fakeClient(payload: unknown, stopReason = "end_turn") {
  const calls: Array<Record<string, unknown>> = [];
  const client: MessagesClient = {
    messages: {
      async create(params) {
        calls.push(params);
        return { stop_reason: stopReason, content: [{ type: "text", text: JSON.stringify(payload) }] };
      },
    },
  };
  return { client, calls };
}

const allOk = { verdicts: [{ rule_index: 0, verdict: "ok", evidence: "" }, { rule_index: 1, verdict: "ok", evidence: "" }] };

it("parses a live call and caches it", async () => {
  const payload = { verdicts: [{ rule_index: 0, verdict: "violates", evidence: "takeaway cup" }, { rule_index: 1, verdict: "ok", evidence: "" }] };
  const { client, calls } = fakeClient(payload);
  const cachePath = tmpFile("cache.json");

  const { verdicts, source } = await new BrainChecker({ cachePath, live: true, client }).check("Northpeak Coffee", "pour into a takeaway cup", RULES);
  expect(verdicts.map((v) => v.verdict)).toEqual(["violates", "ok"]);
  expect(source).toBe("claude-haiku-5-5");
  expect(calls[0].model).toBe("claude-haiku-5-5");
  expect((calls[0].output_config as { format: { type: string } }).format.type).toBe("json_schema");

  // Same copy, same rules: answered from the cache file, no second call.
  const again = await new BrainChecker({ cachePath, live: true, client }).check("Northpeak Coffee", "pour into a takeaway cup", RULES);
  expect(again.source.startsWith("cache")).toBe(true);
  expect(calls).toHaveLength(1);
});

it("misses the cache when the copy or the rules change", async () => {
  const { client, calls } = fakeClient(allOk);
  const checker = new BrainChecker({ cachePath: tmpFile("c.json"), live: true, client });
  await checker.check("Northpeak Coffee", "copy v1", RULES);
  await checker.check("Northpeak Coffee", "copy v2", RULES);
  await checker.check("Northpeak Coffee", "copy v2", RULES.slice(0, 1));
  expect(calls).toHaveLength(3);
});

it("treats a rule the model skipped as unsure, not ok", async () => {
  const { client } = fakeClient({ verdicts: [{ rule_index: 0, verdict: "ok", evidence: "" }] });
  const { verdicts } = await new BrainChecker({ live: true, client }).check("Northpeak Coffee", "copy", RULES);
  expect(verdicts.map((v) => v.verdict)).toEqual(["ok", "unsure"]);
});

it("fails closed on an API error or a truncated reply", async () => {
  const boom: MessagesClient = { messages: { create: async () => { throw new Error("timeout"); } } };
  for (const client of [boom, fakeClient({}, "max_tokens").client]) {
    const { verdicts, source } = await new BrainChecker({ live: true, client }).check("Northpeak Coffee", "copy", RULES);
    expect(source).toBe("unchecked");
    expect(new Set(verdicts.map((v) => v.verdict))).toEqual(new Set(["unsure"]));
  }
});

it("answers unsure on a cache miss when live calls are off", async () => {
  const checker = new BrainChecker({ live: false });
  const { verdicts, source } = await checker.check("Northpeak Coffee", "copy", RULES);
  expect(source).toBe("unchecked");
  expect(checker.stats.unchecked).toBe(1);
  expect(verdicts.every((v) => v.verdict === "unsure")).toBe(true);
});
