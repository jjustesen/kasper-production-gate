// Shapes of the input data and of the gate's verdicts.
// Field names stay snake_case so they match the JSON files one to one.

export interface Comment {
  by: string;
  at: string;
  text: string;
}

export interface Brief {
  id: string;
  client: string;
  title?: string;
  created_at: string;
  platforms?: string[];
  formats?: string[];
  deliverables?: { statics?: number; videos?: number };
  due_date?: string | null;
  products?: string[];
  copy_direction?: string;
  assets_link?: string | null;
  use_studio_catalog?: boolean;
  notes?: string;
  comments?: Comment[];
}

export interface CatalogItem {
  sku: string;
  name: string;
  aliases?: string[];
  active?: boolean;
  note?: string;
}

export interface Client {
  client: string;
  squad: string;
  squad_lead: string;
  status: string;
  paused_reason?: string;
  plan_per_month: Counts;
  used_this_month: Counts;
  max_discount_pct?: number;
  banned_claims?: string[];
  brain_rules?: string[];
  catalog?: CatalogItem[];
}

export const KINDS = ["statics", "videos"] as const;
export type Kind = (typeof KINDS)[number];
export type Counts = Record<Kind, number>;
export type Quota = Record<Kind, { used: number; plan: number }>;

// Who has to act on a reason before the brief can move:
//   client   - the client must change or confirm something
//   approval - the Squad Lead can unblock it (rush, overage), or ask the client
//   internal - an internal owner decides (finance pause, human review of copy)
export const AUDIENCES = ["client", "approval", "internal"] as const;
export type Audience = (typeof AUDIENCES)[number];

export const PASS = "PASS";
export const BLOCKED = "BLOCKED";
export type Status = typeof PASS | typeof BLOCKED;

export interface Reason {
  rule: number;
  code: string;
  audience: Audience;
  detail: string;
  client_ask: string | null;
  evidence: string | null;
}

export interface BrainVerdict {
  rule: string;
  verdict: "violates" | "ok" | "unsure";
  evidence: string;
}

export interface Verdict {
  brief_id: string;
  client: string;
  squad: string;
  squad_lead: string;
  title: string;
  due_date: string | null;
  deliverables: Counts;
  status: Status;
  reasons: Reason[];
  checks: Record<string, string>;
  approvals: string[];
  notes: string[];
  skus: string[];
  business_days: number | null;
  quota_after: Quota | null;
  brain_source: string | null;
  client_message: string | null;
  client_message_if_declined: string | null;
}

export function reason(fields: Omit<Reason, "client_ask" | "evidence"> & Partial<Reason>): Reason {
  return { client_ask: null, evidence: null, ...fields };
}

/** The most client-facing audience among the reasons, or null on PASS. */
export function kindOf(v: Verdict): Audience | null {
  const audiences = new Set(v.reasons.map((r) => r.audience));
  return AUDIENCES.find((a) => audiences.has(a)) ?? null;
}
