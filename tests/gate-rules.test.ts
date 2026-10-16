// Each Definition of Ready rule, on briefs built for the case (not the 30 test briefs).

import { describe, expect, it } from "vitest";
import { Gate } from "../src/gate.ts";
import { kindOf, type Brief, type Verdict } from "../src/models.ts";
import { FakeBrain, loadClients, makeBrief, NOW } from "./helpers.ts";

const clients = loadClients();

function run(briefs: Brief[], brain = new FakeBrain()): Promise<Verdict[]> {
  return new Gate(clients, brain, NOW).run(briefs);
}

async function one(brief: Brief, brain?: FakeBrain): Promise<Verdict> {
  return (await run([brief], brain))[0];
}

const codes = (v: Verdict) => v.reasons.map((r) => r.code);

it("passes a clean brief", async () => {
  const v = await one(makeBrief());
  expect(v.status).toBe("PASS");
  expect(v.reasons).toEqual([]);
});

describe("rule 1: client active", () => {
  it("blocks a paused client internally and skips the LLM", async () => {
    const brain = new FakeBrain();
    const v = await one(makeBrief({ client: "Brightside Kids", products: ["BK-LUNCH"] }), brain);
    expect(codes(v)).toEqual(["client_paused"]);
    expect(kindOf(v)).toBe("internal");
    expect(v.client_message).toBeNull();
    expect(brain.calls).toBe(0);
  });
});

describe("rule 2: required fields", () => {
  it("collects every missing field", async () => {
    const v = await one(makeBrief({ platforms: [], formats: [], deliverables: { statics: 0, videos: 0 } }));
    expect(codes(v)).toEqual(["missing_fields"]);
    expect(v.reasons[0].detail).toContain("platforms");
    expect(v.reasons[0].detail).toContain("formats");
    expect(v.reasons[0].detail).toContain("deliverable counts");
  });

  it("requires a duration for video", async () => {
    const v = await one(makeBrief({ formats: ["9:16"], deliverables: { statics: 0, videos: 1 }, due_date: "2026-10-23" }));
    expect(v.reasons[0].detail).toContain("video duration");
  });
});

describe("rule 3: turnaround", () => {
  it("passes statics exactly three business days out", async () => {
    const v = await one(makeBrief({ due_date: "2026-10-16" }));
    expect(v.status).toBe("PASS");
    expect(v.business_days).toBe(3);
  });

  it("needs five business days for video", async () => {
    const video = { formats: ["9:16 15s"], deliverables: { statics: 0, videos: 1 } };
    expect((await one(makeBrief({ due_date: "2026-10-19", ...video }))).status).toBe("BLOCKED");
    expect((await one(makeBrief({ due_date: "2026-10-20", ...video }))).status).toBe("PASS");
  });

  it("uses the video minimum for a mixed brief", async () => {
    const v = await one(makeBrief({ formats: ["4:5", "9:16 15s"], deliverables: { statics: 1, videos: 1 }, due_date: "2026-10-16" }));
    expect(codes(v)).toEqual(["turnaround"]);
  });

  it("only accepts a rush from the Squad Lead", async () => {
    const designer = [{ by: "Juliana", at: "2026-10-12T19:40:00Z", text: "rush ok" }];
    const lead = [{ by: "Louise", at: "2026-10-12T19:40:00Z", text: "Rush approved" }];
    const blocked = await one(makeBrief({ due_date: "2026-10-14", comments: designer }));
    const passed = await one(makeBrief({ due_date: "2026-10-14", comments: lead }));

    expect(codes(blocked)).toEqual(["turnaround"]);
    expect(kindOf(blocked)).toBe("approval");
    expect(blocked.reasons[0].detail).toContain("Juliana");
    expect(blocked.reasons[0].detail).toContain("Fri 16 Oct");
    expect(blocked.client_message).toBeNull();
    expect(blocked.client_message_if_declined).toContain("Friday 16 October");

    expect(passed.status).toBe("PASS");
    expect(passed.approvals).toEqual(["rush"]);
  });

  it("ignores a rush approved by another client's Squad Lead", async () => {
    const bea = [{ by: "Bea A.", at: "2026-10-12T19:40:00Z", text: "Rush approved" }];
    const v = await one(makeBrief({ due_date: "2026-10-14", comments: bea })); // Northpeak's lead is Louise
    expect(codes(v)).toEqual(["turnaround"]);
  });
});

describe("rule 4: products", () => {
  it("reports unknown and inactive products", async () => {
    const v = await one(makeBrief({ products: ["oat brew", "Hazelnut Tin", "mocha pods"] }));
    expect(codes(v)).toEqual(["product_inactive", "product_unknown"]);
    expect(v.skus).toEqual(["NP-CB-OAT"]);
  });

  it("matches aliases inside the client's own catalog only", async () => {
    // "kit" exists at Lumen and Halo; at Northpeak it is unknown.
    expect(codes(await one(makeBrief({ products: ["kit"] })))).toEqual(["product_unknown"]);
  });

  it("allows brand-only work", async () => {
    expect((await one(makeBrief({ products: ["brand"] }))).status).toBe("PASS");
  });
});

describe("rule 5: assets", () => {
  it("accepts Studio catalog shots instead of a Drive link", async () => {
    expect((await one(makeBrief({ assets_link: "", use_studio_catalog: true }))).status).toBe("PASS");
    expect(codes(await one(makeBrief({ assets_link: "", use_studio_catalog: false })))).toEqual(["assets_missing"]);
  });
});

describe("rule 6: claims", () => {
  it("allows a discount at the cap and blocks one above it", async () => {
    expect((await one(makeBrief({ copy_direction: "25% off your first box" }))).status).toBe("PASS");
    expect(codes(await one(makeBrief({ copy_direction: "26% off your first box" })))).toEqual(["discount_over_cap"]);
  });

  it("doesn't check internal notes for claims", async () => {
    const v = await one(makeBrief({ client: "Lumen Skin", products: ["LS-MOIST"], notes: "No cure claims, client legal." }));
    expect(v.status).toBe("PASS");
  });

  it("turns a Brain violation into a client block and 'unsure' into human review", async () => {
    const rule = "No superlatives we can't prove.";
    const violates = await one(makeBrief(), new FakeBrain({ [rule]: "violates" }));
    const unsure = await one(makeBrief(), new FakeBrain({ [rule]: "unsure" }));
    expect(codes(violates)).toEqual(["brain_rule"]);
    expect(kindOf(violates)).toBe("client");
    expect(codes(unsure)).toEqual(["brain_unsure"]);
    expect(kindOf(unsure)).toBe("internal");
    expect(unsure.client_message).toBeNull();
  });
});

describe("rule 7: quota", () => {
  const ridge = { client: "Ridge Outdoor", products: ["RO-BOTTLE"] };

  it("doesn't let blocked briefs use quota", async () => {
    // Ridge: 5 of 12 statics used. A blocked 4-static brief must not eat quota.
    const first = makeBrief({ id: "A", deliverables: { statics: 4, videos: 0 }, copy_direction: "60% off", ...ridge });
    const second = makeBrief({ id: "B", created_at: "2026-10-12T09:00:00Z", deliverables: { statics: 7, videos: 0 }, ...ridge });
    const [a, b] = await run([first, second]);
    expect(a.status).toBe("BLOCKED");
    expect(b.status).toBe("PASS");
    expect(b.quota_after?.statics).toEqual({ used: 12, plan: 12 });
  });

  it("counts this batch in created_at order", async () => {
    const four = { deliverables: { statics: 4, videos: 0 }, ...ridge };
    const late = makeBrief({ id: "LATE", created_at: "2026-10-12T12:00:00Z", ...four });
    const early = makeBrief({ id: "EARLY", created_at: "2026-10-12T08:00:00Z", ...four });
    // 5 used + 4 = 9 ok; + 4 = 13 > 12 blocked. Order follows created_at, not list order.
    const byId = Object.fromEntries((await run([late, early])).map((v) => [v.brief_id, v]));
    expect(byId.EARLY.status).toBe("PASS");
    expect(codes(byId.LATE)).toEqual(["quota_exceeded"]);
  });

  it("applies an overage approval only to its own brief", async () => {
    const pawfect = {
      client: "Pawfect Treats", products: ["PT-BOX"], formats: ["9:16 15s"],
      deliverables: { statics: 0, videos: 1 }, due_date: "2026-10-27",
    };
    const approval = [{ by: "Bea A.", at: "2026-10-12T15:05:00Z", text: "Overage approved by Bea A." }];
    const [a, b] = await run([
      makeBrief({ id: "NO", ...pawfect }),
      makeBrief({ id: "OK", created_at: "2026-10-12T09:00:00Z", comments: approval, ...pawfect }),
    ]);
    expect(codes(a)).toEqual(["quota_exceeded"]);
    expect(b.status).toBe("PASS");
    expect(b.approvals).toEqual(["overage"]);
    expect(b.quota_after?.videos).toEqual({ used: 5, plan: 4 });
  });
});

it("reports every failure, not just the first, in one client message", async () => {
  const v = await one(makeBrief({ products: ["Hazelnut Tin"], copy_direction: "40% off", assets_link: "", due_date: "2026-10-14" }));
  expect(codes(v)).toEqual(["turnaround", "product_inactive", "assets_missing", "discount_over_cap"]);
  for (const part of ["Hazelnut Tin", "40%", "Drive link", "Friday 16 October"]) {
    expect(v.client_message).toContain(part);
  }
});
