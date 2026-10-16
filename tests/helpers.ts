// Shared test data and stubs.

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import type { BrainCheck } from "../src/brain.ts";
import type { Brief, Client } from "../src/models.ts";

export const ROOT = join(fileURLToPath(import.meta.url), "..", "..");
export const DATA = join(ROOT, "data", "option_b_gate");
export const NOW = new Date("2026-10-13T09:00:00Z"); // Tuesday

export function loadClients(): Map<string, Client> {
  const list = JSON.parse(readFileSync(join(DATA, "clients.json"), "utf-8")) as Client[];
  return new Map(list.map((c) => [c.client, c]));
}

export function loadBriefs(): Brief[] {
  return JSON.parse(readFileSync(join(DATA, "briefs.json"), "utf-8")) as Brief[];
}

/** Brain checker stub: "ok" for every rule unless told otherwise. */
export class FakeBrain implements BrainCheck {
  calls = 0;
  private answers: Record<string, "violates" | "unsure">;

  constructor(answers: Record<string, "violates" | "unsure"> = {}) {
    this.answers = answers;
  }

  async check(_client: string, text: string, rules: string[]) {
    this.calls += 1;
    return {
      verdicts: rules.map((rule) => ({ rule, verdict: this.answers[rule] ?? ("ok" as const), evidence: text.slice(0, 40) })),
      source: "fake",
    };
  }
}

/** A clean, passing Northpeak statics brief; override fields per test. */
export function makeBrief(overrides: Partial<Brief> = {}): Brief {
  return {
    id: "T-01",
    client: "Northpeak Coffee",
    title: "Test brief",
    created_at: "2026-10-12T08:00:00Z",
    platforms: ["Meta"],
    formats: ["4:5"],
    deliverables: { statics: 1, videos: 0 },
    due_date: "2026-10-20",
    products: ["NP-CB-ORG"],
    copy_direction: "Cold brew, ready when you are.",
    assets_link: "https://drive.google.com/drive/folders/x",
    use_studio_catalog: false,
    notes: "",
    comments: [],
    ...overrides,
  };
}
