// Find Squad Lead approvals (rush, overage) in ClickUp comments.

import type { Comment } from "./models.ts";

export type ApprovalKind = "rush" | "overage";

const TOPIC: Record<ApprovalKind, RegExp> = {
  rush: /\brush\b/i,
  overage: /\b(overage|over quota|over the plan|extra)\b/i,
};
const APPROVE = /\b(approved?|ok|okay|go ahead|yes)\b/i;
const NEGATION = /\b(not|no|declined?|rejected?|can't|cannot)\b/i;

function isApproval(text: string, kind: ApprovalKind): boolean {
  return TOPIC[kind].test(text) && APPROVE.test(text) && !NEGATION.test(text);
}

/**
 * The Squad Lead's approval comment (or null), plus approvals by anyone else.
 *
 * Only comments written by the client's Squad Lead, at or before the check
 * time, count. Approvals by other people are returned so the alert can say
 * why they were ignored.
 */
export function findApproval(
  comments: Comment[],
  kind: ApprovalKind,
  squadLead: string,
  now: Date,
): { lead: Comment | null; others: Comment[] } {
  let lead: Comment | null = null;
  const others: Comment[] = [];
  for (const comment of comments) {
    if (new Date(comment.at) > now || !isApproval(comment.text, kind)) continue;
    if (comment.by === squadLead) lead = comment;
    else others.push(comment);
  }
  return { lead, others };
}
