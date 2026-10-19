// The 30 test briefs against the hand-written answer key, plus output checks.

import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import { BrainChecker } from "../src/brain.ts";
import { main } from "../src/cli.ts";
import { Gate } from "../src/gate.ts";
import { kindOf, type Verdict } from "../src/models.ts";
import { slug } from "../src/render.ts";
import { loadBriefs, loadClients, NOW, ROOT } from "./helpers.ts";

interface Expected { status: string; codes: string[]; approvals?: string[]; why: string }

const { _comment, ...EXPECTED } = JSON.parse(readFileSync(join(ROOT, "expected", "gate_expected.json"), "utf-8")) as Record<string, Expected>;
const CACHE = join(ROOT, "cache", "brain_cache.json");

let verdicts: Record<string, Verdict>;
let brain: BrainChecker;

beforeAll(async () => {
  brain = new BrainChecker({ cachePath: CACHE, live: false });
  const list = await new Gate(loadClients(), brain, NOW).run(loadBriefs());
  verdicts = Object.fromEntries(list.map((v) => [v.brief_id, v]));
});

describe("the 30 briefs match the answer key", () => {
  it.each(Object.keys(EXPECTED).sort())("%s", (id) => {
    const v = verdicts[id];
    const want = EXPECTED[id];
    expect(v.status, want.why).toBe(want.status);
    expect([...new Set(v.reasons.map((r) => r.code))].sort(), want.why).toEqual([...want.codes].sort());
    expect(v.approvals).toEqual(want.approvals ?? []);
  });
});

it("has the right totals and never calls the model for the paused client", () => {
  expect(Object.values(verdicts).filter((v) => v.status === "PASS")).toHaveLength(19);
  expect(brain.stats).toMatchObject({ cache_hits: 29, live_calls: 0, unchecked: 0 }); // BR-22 never reaches the LLM
});

it("gives every block a reason and a next step", () => {
  for (const v of Object.values(verdicts)) {
    if (v.status !== "BLOCKED") continue;
    expect(v.reasons.length).toBeGreaterThan(0);
    const kind = kindOf(v);
    if (kind === "client") expect(v.client_message).toBeTruthy();
    else if (kind === "approval") expect(v.client_message_if_declined).toBeTruthy();
    else expect(v.client_message).toBeNull(); // internal: nothing goes to the client
  }
});

it("never leaks internal details into client messages", () => {
  for (const v of Object.values(verdicts)) {
    for (const msg of [v.client_message, v.client_message_if_declined].filter(Boolean)) {
      for (const word of ["Brain", "LLM", "invoice", "Squad Lead", "Juliana", "gate"]) {
        expect(msg, `${v.brief_id}: ${word}`).not.toContain(word);
      }
    }
  }
});

it("asks about banned claims once", () => {
  const msg = verdicts["BR-19"].client_message!;
  expect(msg.split("Could you share an alternative").length - 1).toBe(1);
  expect(msg).toContain('"cure", "insomnia" and "clinically proven"');
});

it("sends copy to human review when there is no cache and no API", async () => {
  const empty = new BrainChecker({ cachePath: join(mkdtempSync(join(tmpdir(), "gate-")), "none.json") });
  const list = await new Gate(loadClients(), empty, NOW).run(loadBriefs());
  const br01 = list.find((v) => v.brief_id === "BR-01")!;
  // BR-01 is clean, but nobody checked its copy against the Brain: fail closed.
  expect(br01.status).toBe("BLOCKED");
  expect(new Set(br01.reasons.map((r) => r.code))).toEqual(new Set(["brain_unsure"]));
});

it("writes every output from the CLI", async () => {
  const out = mkdtempSync(join(tmpdir(), "gate-out-"));
  expect(await main(["--out", out])).toBe(0);
  const read = (f: string) => readFileSync(join(out, f), "utf-8");

  expect(JSON.parse(read("results.json")).summary.blocked).toBe(11);
  const actions = JSON.parse(read("clickup_actions.json")) as Array<{ set_status: string }>;
  expect(new Set(actions.map((a) => a.set_status))).toEqual(new Set(["Queued", "Blocked"]));
  const alerts = JSON.parse(read(join("slack", "alerts.json"))) as Array<{ channel: string }>;
  expect(alerts).toHaveLength(11);
  expect(alerts[0].channel.startsWith("#int-")).toBe(true);
  for (const squad of ["squad-a", "squad-b"]) {
    expect(JSON.parse(read(join("slack", `digest_${squad}.json`))).blocks[0].type).toBe("header");
  }
  expect(read("report.md").startsWith("# Production gate run")).toBe(true);
  const html = read("preview.html");
  expect(html).toContain('"brief_id":"BR-30"');
  expect(html).not.toContain("__DATA__");
});

it("makes channel slugs", () => {
  expect(slug("Ridge Outdoor")).toBe("ridge-outdoor");
  expect(slug("Bea A.")).toBe("bea-a");
});
