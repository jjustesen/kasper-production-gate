// The production gate: Definition of Ready rules 1-7, applied to a batch of briefs.
//
// Everything here is plain code except rule 6's Brain-rule check, which is
// delegated to a BrainCheck (cached cheap-model call). The LLM never decides
// dates, counts, quotas or discounts.

import { findApproval } from "./approvals.ts";
import type { BrainCheck } from "./brain.ts";
import { findBanned, maxDiscount } from "./claims.ts";
import {
  DEFAULT_CHECK_TIME,
  MIN_BUSINESS_DAYS_STATIC,
  MIN_BUSINESS_DAYS_VIDEO,
} from "./config.ts";
import {
  addBusinessDays,
  businessDaysBetween,
  dayOf,
  longDay,
  parseDate,
  shortDay,
} from "./dates.ts";
import { attach, humanJoin } from "./messages.ts";
import {
  BLOCKED,
  KINDS,
  PASS,
  reason,
  type Brief,
  type CatalogItem,
  type Client,
  type Counts,
  type Quota,
  type Verdict,
} from "./models.ts";
import { buildIndex, isBrandOnly, resolve } from "./products.ts";

const ASPECT_RATIO = /^\s*\d+(?:\.\d+)?:\d+(?:\.\d+)?\b/;
const DURATION = /\b\d+\s?s\b/i;

/** The client-facing words we check for claims. Notes are internal
 *  instructions to the designer and are not checked. */
export function copyText(brief: Brief): string {
  return [brief.title, brief.copy_direction].filter(Boolean).join(" ");
}

function counts(brief: Brief): Counts {
  const d = brief.deliverables ?? {};
  return { statics: Number(d.statics ?? 0), videos: Number(d.videos ?? 0) };
}

export class Gate {
  readonly now: Date;
  private readonly today: Date;
  private readonly clients: Map<string, Client>;
  private readonly brain: BrainCheck;
  // Rule 7: what this batch has already let through, per client.
  private readonly accepted = new Map<string, Counts>();
  private readonly indexes = new Map<string, Map<string, CatalogItem>>();

  constructor(clients: Map<string, Client>, brain: BrainCheck, now?: Date) {
    this.clients = clients;
    this.brain = brain;
    this.now = now ?? DEFAULT_CHECK_TIME;
    this.today = dayOf(this.now);
    for (const [name, client] of clients) {
      this.accepted.set(name, { statics: 0, videos: 0 });
      this.indexes.set(name, buildIndex(client.catalog ?? []));
    }
  }

  async run(briefs: Brief[]): Promise<Verdict[]> {
    const ordered = [...briefs].sort((a, b) =>
      a.created_at.localeCompare(b.created_at)
    );
    const verdicts: Verdict[] = [];
    for (const brief of ordered) verdicts.push(await this.check(brief)); // in order: quota depends on earlier briefs
    return verdicts;
  }

  async check(brief: Brief): Promise<Verdict> {
    const client = this.clients.get(brief.client);
    if (!client)
      throw new Error(
        `${brief.id}: unknown client ${JSON.stringify(brief.client)}`
      );
    const v: Verdict = {
      brief_id: brief.id,
      client: client.client,
      squad: client.squad,
      squad_lead: client.squad_lead,
      title: brief.title ?? "",
      due_date: brief.due_date ?? null,
      deliverables: counts(brief),
      status: PASS,
      reasons: [],
      checks: {},
      approvals: [],
      notes: [],
      skus: [],
      business_days: null,
      quota_after: null,
      brain_source: null,
      client_message: null,
      client_message_if_declined: null,
    };
    this.rule1Active(client, v);
    this.rule2Fields(brief, v);
    this.rule3Turnaround(brief, client, v);
    this.rule4Products(brief, client, v);
    this.rule5Assets(brief, v);
    await this.rule6Claims(brief, client, v);
    this.rule7Quota(brief, client, v);

    v.status = v.reasons.length ? BLOCKED : PASS;
    if (v.status === PASS) {
      const accepted = this.accepted.get(client.client)!;
      for (const k of KINDS) accepted[k] += v.deliverables[k];
    }
    v.quota_after = this.quotaSnapshot(client.client);
    attach(v);
    return v;
  }

  quotaSnapshot(clientName: string): Quota {
    const client = this.clients.get(clientName)!;
    const accepted = this.accepted.get(clientName)!;
    return {
      statics: {
        used: client.used_this_month.statics + accepted.statics,
        plan: client.plan_per_month.statics,
      },
      videos: {
        used: client.used_this_month.videos + accepted.videos,
        plan: client.plan_per_month.videos,
      },
    };
  }

  // Rule 1 -------------------------------------------------------------------
  private rule1Active(client: Client, v: Verdict) {
    if (client.status === "active") {
      v.checks["1 client active"] = "ok";
      return;
    }
    v.checks["1 client active"] = "failed";
    v.reasons.push(
      reason({
        rule: 1,
        code: "client_paused",
        audience: "internal",
        detail: `${client.client} is ${client.status}: ${
          client.paused_reason ?? "no reason on file"
        }`,
      })
    );
  }

  // Rule 2 -------------------------------------------------------------------
  private rule2Fields(brief: Brief, v: Verdict) {
    const missing: string[] = [];
    if (!brief.platforms?.length) missing.push("platforms");
    const formats = brief.formats ?? [];
    if (!formats.length || !formats.every((f) => ASPECT_RATIO.test(f)))
      missing.push("formats (aspect ratio)");
    if (
      formats.length &&
      v.deliverables.videos &&
      !formats.some((f) => DURATION.test(f))
    )
      missing.push("video duration");
    if (!v.deliverables.statics && !v.deliverables.videos)
      missing.push("deliverable counts");
    if (!parseDate(brief.due_date)) missing.push("due date");
    if (!brief.products?.length) missing.push('products (or "brand")');

    if (!missing.length) {
      v.checks["2 required fields"] = "ok";
      return;
    }
    v.checks["2 required fields"] = "failed";
    v.reasons.push(
      reason({
        rule: 2,
        code: "missing_fields",
        audience: "client",
        detail: `Missing: ${missing.join(", ")}.`,
        client_ask: `Could you confirm the ${humanJoin(
          missing
        )} for this brief?`,
      })
    );
  }

  // Rule 3 -------------------------------------------------------------------
  private rule3Turnaround(brief: Brief, client: Client, v: Verdict) {
    const due = parseDate(brief.due_date);
    if (!due) {
      v.checks["3 turnaround"] = "skipped (no due date)";
      return;
    }
    const hasVideo = v.deliverables.videos > 0;
    const minimum = hasVideo
      ? MIN_BUSINESS_DAYS_VIDEO
      : MIN_BUSINESS_DAYS_STATIC;
    v.business_days = businessDaysBetween(this.today, due);
    if (v.business_days >= minimum) {
      v.checks["3 turnaround"] = "ok";
      return;
    }

    const { lead, others } = findApproval(
      brief.comments ?? [],
      "rush",
      client.squad_lead,
      this.now
    );
    if (lead) {
      v.checks["3 turnaround"] = "ok (rush approved)";
      v.approvals.push("rush");
      v.notes.push(`Rush approved by ${lead.by}: "${lead.text}"`);
      return;
    }

    const earliest = addBusinessDays(this.today, minimum);
    let detail =
      `Due ${shortDay(due)} is ${v.business_days} business day(s) out; ` +
      `${
        hasVideo ? "video" : "statics"
      } need ${minimum}. Earliest normal date: ${shortDay(earliest)}.`;
    if (others.length) {
      const names = [...new Set(others.map((c) => c.by))].sort().join(", ");
      detail += ` ${names} said rush ok, but only the Squad Lead (${client.squad_lead}) can approve a rush.`;
    }
    v.checks["3 turnaround"] = "failed";
    v.reasons.push(
      reason({
        rule: 3,
        code: "turnaround",
        audience: "approval",
        detail,
        client_ask: `Could we move the due date to ${longDay(
          earliest
        )}? That gives the team the time this needs.`,
      })
    );
  }

  // Rule 4 -------------------------------------------------------------------
  private rule4Products(brief: Brief, client: Client, v: Verdict) {
    const names = brief.products ?? [];
    if (!names.length) {
      v.checks["4 products"] = "skipped (no products)";
      return;
    }
    const index = this.indexes.get(client.client)!;
    let ok = true;
    for (const name of names) {
      if (isBrandOnly(name)) continue;
      const item = resolve(name, index);
      if (!item) {
        ok = false;
        v.reasons.push(
          reason({
            rule: 4,
            code: "product_unknown",
            audience: "client",
            detail: `'${name}' is not in ${client.client}'s catalog.`,
            client_ask: `We couldn't find '${name}' in your product catalog. Which product (or SKU) is this?`,
          })
        );
      } else if (item.active === false) {
        ok = false;
        const note = item.note ? ` (${item.note})` : "";
        v.reasons.push(
          reason({
            rule: 4,
            code: "product_inactive",
            audience: "client",
            detail: `${item.name} [${item.sku}] is not active${note}.`,
            client_ask: `Our catalog shows ${item.name} as no longer available. Should we feature a different product instead?`,
          })
        );
      } else {
        v.skus.push(item.sku);
      }
    }
    v.checks["4 products"] = ok ? "ok" : "failed";
  }

  // Rule 5 -------------------------------------------------------------------
  private rule5Assets(brief: Brief, v: Verdict) {
    const link = (brief.assets_link ?? "").trim();
    if (link.startsWith("http") || brief.use_studio_catalog) {
      v.checks["5 assets"] = link ? "ok" : "ok (Studio catalog shots)";
      return;
    }
    v.checks["5 assets"] = "failed";
    v.reasons.push(
      reason({
        rule: 5,
        code: "assets_missing",
        audience: "client",
        detail: "No Drive link and no note to use Studio catalog shots.",
        client_ask:
          "Could you share a Drive link with the assets, or confirm we should use the product shots we already have?",
      })
    );
  }

  // Rule 6 -------------------------------------------------------------------
  private async rule6Claims(brief: Brief, client: Client, v: Verdict) {
    const text = copyText(brief);
    const before = v.reasons.length;

    for (const phrase of findBanned(text, client.banned_claims ?? [])) {
      v.reasons.push(
        reason({
          rule: 6,
          code: "banned_claim",
          audience: "client",
          evidence: phrase,
          detail: `Copy uses banned claim '${phrase}'.`,
          client_ask: `The copy includes "${phrase}", which is on the list of claims we've agreed not to use. Could you share an alternative line?`,
        })
      );
    }

    const discount = maxDiscount(text);
    const cap = client.max_discount_pct;
    if (discount !== null && cap !== undefined && discount > cap) {
      v.reasons.push(
        reason({
          rule: 6,
          code: "discount_over_cap",
          audience: "client",
          detail: `Discount of ${discount}% is above the ${cap}% cap.`,
          client_ask: `The brief says ${discount}% off, but our agreed cap is ${cap}%. Should we go with ${cap}% (or lower)?`,
        })
      );
    }

    // The Brain-rule check is the only LLM step. Skip it when it can't
    // change anything: paused client, or no Brain rules on file.
    const rules = client.brain_rules ?? [];
    if (client.status !== "active" || !rules.length || !text.trim()) {
      v.checks["6 claims"] =
        v.reasons.length > before ? "failed" : "ok (Brain check skipped)";
      return;
    }

    const { verdicts, source } = await this.brain.check(
      client.client,
      text,
      rules
    );
    v.brain_source = source;
    for (const bv of verdicts) {
      if (bv.verdict === "violates") {
        v.reasons.push(
          reason({
            rule: 6,
            code: "brain_rule",
            audience: "client",
            evidence: bv.evidence,
            detail: `Breaks Brain rule "${bv.rule}" ('${bv.evidence}').`,
            client_ask: `"${
              bv.evidence
            }" goes against a brand rule we have on file ("${bv.rule.replace(
              /\.+$/,
              ""
            )}"). Could you share an alternative?`,
          })
        );
      } else if (bv.verdict === "unsure") {
        v.reasons.push(
          reason({
            rule: 6,
            code: "brain_unsure",
            audience: "internal",
            evidence: bv.evidence,
            detail: `Couldn't confirm the copy follows "${bv.rule}". A person should check it.`,
          })
        );
      }
    }
    v.checks["6 claims"] = v.reasons.length > before ? "failed" : "ok";
  }

  // Rule 7 -------------------------------------------------------------------
  private rule7Quota(brief: Brief, client: Client, v: Verdict) {
    const accepted = this.accepted.get(client.client)!;
    const over: Array<[string, number, number]> = [];
    for (const k of KINDS) {
      if (!v.deliverables[k]) continue;
      const total = client.used_this_month[k] + accepted[k] + v.deliverables[k];
      const plan = client.plan_per_month[k];
      if (total > plan) over.push([k, total, plan]);
    }
    if (!over.length) {
      v.checks["7 quota"] = "ok";
      return;
    }

    const { lead } = findApproval(
      brief.comments ?? [],
      "overage",
      client.squad_lead,
      this.now
    );
    if (lead) {
      v.checks["7 quota"] = "ok (overage approved)";
      v.approvals.push("overage");
      v.notes.push(`Overage approved by ${lead.by}: "${lead.text}"`);
      return;
    }

    const summary = over
      .map(([k, total, plan]) => `${k} ${total}/${plan}`)
      .join("; ");
    v.checks["7 quota"] = "failed";
    v.reasons.push(
      reason({
        rule: 7,
        code: "quota_exceeded",
        audience: "approval",
        detail: `Would take ${client.client} over this month's plan: ${summary}.`,
        client_ask: `This would take you past this month's plan (${summary}). Should we schedule it for next month, or add it as extra work?`,
      })
    );
  }
}
