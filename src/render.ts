// Turn verdicts into what we would post: ClickUp actions, Slack Block Kit, a Markdown report.
//
// Nothing is posted for real. Each output is a dry-run payload a thin adapter
// (ClickUp API, Slack chat.postMessage) would send as-is.

import { isoUtc, longDateTime, shortDateTime } from "./dates.ts";
import { BLOCKED, kindOf, type Audience, type Quota, type Verdict } from "./models.ts";

export const KIND_LABEL: Record<Audience, string> = {
  client: "Blocked",
  approval: "Needs approval",
  internal: "Blocked (internal)",
};

const label = (v: Verdict) => KIND_LABEL[kindOf(v)!];

export function slug(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

export function oneLine(v: Verdict): string {
  return v.reasons.map((r) => r.detail).join(" ");
}

/** A digest-sized summary: one clause per kind of problem. */
export function shortReason(v: Verdict): string {
  const parts: string[] = [];
  const banned = v.reasons.filter((r) => r.code === "banned_claim").map((r) => r.evidence ?? "");
  if (banned.length) parts.push(`banned claims: ${banned.map((b) => `'${b}'`).join(", ")}`);
  for (const r of v.reasons) {
    if (r.code === "banned_claim") continue;
    if (r.code === "brain_rule") {
      if (banned.some((b) => (r.evidence ?? "").toLowerCase().includes(b.toLowerCase()))) continue;
      parts.push(`breaks Brain rule: '${r.evidence}'`);
    } else {
      parts.push(r.detail.replace(/\.+$/, ""));
    }
  }
  return [...new Set(parts)].join("; ");
}

export function quotaLine(q: Quota): string {
  return `statics ${q.statics.used}/${q.statics.plan} · videos ${q.videos.used}/${q.videos.plan}`;
}

// ClickUp --------------------------------------------------------------------
export function clickupAction(v: Verdict, now: Date) {
  let comment: string;
  let status: string;
  let result: string;
  if (v.status === BLOCKED) {
    const failed = [...new Set(v.reasons.map((r) => r.rule))].sort((a, b) => a - b);
    const otherChecks = Object.entries(v.checks)
      .filter(([, s]) => !s.startsWith("failed"))
      .map(([k, s]) => `${k} ${s}`)
      .join(", ");
    comment =
      `Production gate: ${label(v).toLowerCase()}.\n` +
      v.reasons.map((r) => `- Rule ${r.rule}: ${r.detail}`).join("\n") +
      `\nOther checks: ${otherChecks}.\nDraft for the client is in #int-${slug(v.client)}. The gate re-runs when the brief changes.`;
    status = "Blocked";
    result = `${label(v)} (${failed.length === 1 ? "rule" : "rules"} ${failed.join(", ")})`;
  } else {
    comment = "Production gate: passed all 7 checks.";
    if (v.notes.length) comment += ` ${v.notes.join(" ")}`;
    comment += ` ${v.client} this month after this brief: ${quotaLine(v.quota_after!)}.`;
    status = "Queued";
    result = "Passed";
  }
  return {
    task: v.brief_id,
    set_status: status,
    set_custom_fields: { "Gate result": result, "Gate checked at": isoUtc(now) },
    add_comment: comment,
  };
}

// Slack: per-brief alert in #int-<client> --------------------------------------
const section = (text: string) => ({ type: "section", text: { type: "mrkdwn", text } });
const quoted = (text: string) => ">" + text.replaceAll("\n", "\n>");

export function slackAlert(v: Verdict) {
  const header = `*${label(v)}* · *${v.brief_id} · ${v.title}*`;
  const counts = Object.entries(v.deliverables).filter(([, n]) => n).map(([k, n]) => `${n} ${k}`).join(", ");
  const blocks: object[] = [
    section(`${header}\n${counts} · due ${v.due_date} · <@${v.squad_lead}>`),
    section("*Why*\n" + v.reasons.map((r) => `• ${r.detail}`).join("\n")),
  ];
  const buttons: Array<[string, string]> = [];
  if (v.client_message) {
    blocks.push(section(`*Draft for #ext-${slug(v.client)}* (review before posting)\n${quoted(v.client_message)}`));
    buttons.push(["Post to client channel", "post_draft"], ["Edit draft", "edit_draft"]);
  }
  if (v.reasons.some((r) => r.code === "turnaround")) buttons.push(["Approve rush", "approve_rush"]);
  if (v.reasons.some((r) => r.code === "quota_exceeded")) buttons.push(["Approve overage", "approve_overage"]);
  if (v.client_message_if_declined) {
    blocks.push(section(`*If you don't approve, send the client:*\n${quoted(v.client_message_if_declined)}`));
    buttons.push(["Ask client instead", "post_draft"]);
  }
  if (v.reasons.some((r) => r.code === "brain_unsure")) buttons.push(["Copy is fine, re-run", "mark_copy_ok"]);
  buttons.push(["Override block", "override"]);
  blocks.push({
    type: "actions",
    elements: buttons.map(([text, action]) => ({
      type: "button", text: { type: "plain_text", text }, action_id: action, value: v.brief_id,
    })),
  });
  return { channel: `#int-${slug(v.client)}`, text: `${label(v)}: ${v.brief_id} ${v.title}`, blocks };
}

// Slack: daily digest per squad --------------------------------------------------
export function slackDigest(squad: string, verdicts: Verdict[], quotas: Record<string, Quota>, now: Date) {
  const blocked = verdicts.filter((v) => v.status === BLOCKED);
  const lines =
    blocked.map((v) => `• \`${v.brief_id}\` ${v.client} · ${label(v).toLowerCase()}: ${shortReason(v)}`).join("\n") || "None";
  const quotaLines = Object.entries(quotas)
    .map(([client, q]) => {
      const full = q.statics.used >= q.statics.plan || q.videos.used >= q.videos.plan;
      return `• ${client}: ${quotaLine(q)}${full ? " · *full*" : ""}`;
    })
    .join("\n");
  const blocks = [
    { type: "header", text: { type: "plain_text", text: `Production gate · ${squad} · ${shortDateTime(now)} UTC` } },
    {
      type: "section",
      fields: [
        { type: "mrkdwn", text: `*Checked*\n${verdicts.length}` },
        { type: "mrkdwn", text: `*Queued*\n${verdicts.length - blocked.length}` },
        { type: "mrkdwn", text: `*Blocked*\n${blocked.length}` },
      ],
    },
    section("*Blocked (reply to the client the same day)*\n" + lines),
    section("*This month's quota after this run*\n" + quotaLines),
  ];
  return { channel: `#${slug(squad)}`, text: `Gate: ${blocked.length} of ${verdicts.length} briefs blocked`, blocks };
}

// Markdown report ------------------------------------------------------------------
export function markdownReport(
  verdicts: Verdict[],
  quotas: Record<string, Quota>,
  stats: { cache_hits: number; live_calls: number; unchecked: number },
  now: Date,
): string {
  const blocked = verdicts.filter((v) => v.status === BLOCKED);
  const out = [
    `# Production gate run · ${longDateTime(now)} UTC`,
    "",
    `${verdicts.length} briefs checked: **${verdicts.length - blocked.length} queued**, **${blocked.length} blocked**.`,
    `Brain-rule checks: ${stats.cache_hits} from cache, ${stats.live_calls} live model calls, ` +
      `${stats.unchecked} unchecked (sent to human review).`,
    "",
    "| Brief | Client | Result | Reasons |",
    "|---|---|---|---|",
  ];
  for (const v of verdicts) {
    const result =
      v.status === BLOCKED ? label(v) : "Queued" + (v.approvals.length ? ` (${v.approvals.join(", ")} approved)` : "");
    out.push(`| ${v.brief_id} | ${v.client} | ${result} | ${shortReason(v) || "-"} |`);
  }

  out.push("", "## Quota after this run", "");
  for (const [client, q] of Object.entries(quotas)) out.push(`- ${client}: ${quotaLine(q)}`);

  out.push("", "## Blocked briefs", "");
  for (const v of blocked) {
    out.push(`### ${v.brief_id} · ${v.title} (${v.client}, ${label(v).toLowerCase()})`, "");
    for (const r of v.reasons) out.push(`- Rule ${r.rule} \`${r.code}\`: ${r.detail}`);
    if (v.client_message) {
      out.push("", `Draft for #ext-${slug(v.client)}:`, "", "> " + v.client_message.replaceAll("\n", "\n> "));
    }
    if (v.client_message_if_declined) {
      out.push("", "If the Squad Lead doesn't approve, send the client:", "", "> " + v.client_message_if_declined.replaceAll("\n", "\n> "));
    }
    if (kindOf(v) === "internal") out.push("", "No client message: an internal owner decides.");
    out.push("");
  }
  return out.join("\n");
}

export function groupBySquad(verdicts: Verdict[]): Map<string, Verdict[]> {
  const groups = new Map<string, Verdict[]>();
  for (const v of verdicts) {
    if (!groups.has(v.squad)) groups.set(v.squad, []);
    groups.get(v.squad)!.push(v);
  }
  return groups;
}
