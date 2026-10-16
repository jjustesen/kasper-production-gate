"""Turn verdicts into what we would post: ClickUp actions, Slack Block Kit, a Markdown report.

Nothing is posted for real. Each output is a dry-run payload a thin adapter
(ClickUp API, Slack chat.postMessage) would send as-is.
"""

import re
from collections import defaultdict
from datetime import datetime

from .models import BLOCKED, Verdict

KIND_LABEL = {"client": "Blocked", "approval": "Needs approval", "internal": "Blocked (internal)"}


def slug(name: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", name.lower()).strip("-")


def one_line(v: Verdict) -> str:
    return " ".join(r.detail for r in v.reasons)


def short_reason(v: Verdict) -> str:
    """A digest-sized summary: one clause per kind of problem."""
    parts = []
    banned = [r.evidence for r in v.reasons if r.code == "banned_claim"]
    if banned:
        parts.append("banned claims: " + ", ".join(f"'{b}'" for b in banned))
    for r in v.reasons:
        if r.code == "banned_claim":
            continue
        if r.code == "brain_rule":
            if any(b.casefold() in (r.evidence or "").casefold() for b in banned):
                continue
            parts.append(f"breaks Brain rule: '{r.evidence}'")
        else:
            parts.append(r.detail.rstrip("."))
    return "; ".join(dict.fromkeys(parts))


def quota_line(q: dict) -> str:
    return " · ".join(f"{k} {q[k]['used']}/{q[k]['plan']}" for k in ("statics", "videos"))


# ClickUp ---------------------------------------------------------------------
def clickup_action(v: Verdict, now: datetime) -> dict:
    if v.status == BLOCKED:
        failed = sorted({r.rule for r in v.reasons})
        comment = (
            f"Production gate: {KIND_LABEL[v.kind].lower()}.\n"
            + "\n".join(f"- Rule {r.rule}: {r.detail}" for r in v.reasons)
            + "\nOther checks: "
            + ", ".join(f"{k} {s}" for k, s in v.checks.items() if not s.startswith("failed"))
            + f".\nDraft for the client is in #int-{slug(v.client)}. The gate re-runs when the brief changes."
        )
        label = "rule" if len(failed) == 1 else "rules"
        status, result = "Blocked", f"{KIND_LABEL[v.kind]} ({label} {', '.join(map(str, failed))})"
    else:
        comment = "Production gate: passed all 7 checks."
        if v.notes:
            comment += " " + " ".join(v.notes)
        comment += f" {v.client} this month after this brief: {quota_line(v.quota_after)}."
        status, result = "Queued", "Passed"
    return {
        "task": v.brief_id,
        "set_status": status,
        "set_custom_fields": {"Gate result": result, "Gate checked at": now.isoformat()},
        "add_comment": comment,
    }


# Slack: per-brief alert in #int-<client> -------------------------------------------------
def slack_alert(v: Verdict) -> dict:
    header = f"*{KIND_LABEL[v.kind]}* · *{v.brief_id} · {v.title}*"
    counts = ", ".join(f"{n} {k}" for k, n in v.deliverables.items() if n)
    blocks = [
        {"type": "section", "text": {"type": "mrkdwn", "text": f"{header}\n{counts} · due {v.due_date} · <@{v.squad_lead}>"}},
        {"type": "section", "text": {"type": "mrkdwn", "text": "*Why*\n" + "\n".join(f"• {r.detail}" for r in v.reasons)}},
    ]
    buttons = []
    if v.client_message:
        blocks.append({"type": "section", "text": {"type": "mrkdwn", "text": f"*Draft for #ext-{slug(v.client)}* (review before posting)\n>" + v.client_message.replace("\n", "\n>")}})
        buttons += [("Post to client channel", "post_draft"), ("Edit draft", "edit_draft")]
    if any(r.code == "turnaround" for r in v.reasons):
        buttons.append(("Approve rush", "approve_rush"))
    if any(r.code == "quota_exceeded" for r in v.reasons):
        buttons.append(("Approve overage", "approve_overage"))
    if v.client_message_if_declined:
        blocks.append({"type": "section", "text": {"type": "mrkdwn", "text": "*If you don't approve, send the client:*\n>" + v.client_message_if_declined.replace("\n", "\n>")}})
        buttons.append(("Ask client instead", "post_draft"))
    if any(r.code == "brain_unsure" for r in v.reasons):
        buttons.append(("Copy is fine, re-run", "mark_copy_ok"))
    buttons.append(("Override block", "override"))
    blocks.append({"type": "actions", "elements": [
        {"type": "button", "text": {"type": "plain_text", "text": t}, "action_id": a, "value": v.brief_id} for t, a in buttons
    ]})
    return {"channel": f"#int-{slug(v.client)}", "text": f"{KIND_LABEL[v.kind]}: {v.brief_id} {v.title}", "blocks": blocks}


# Slack: daily digest per squad -------------------------------------------------------------
def slack_digest(squad: str, verdicts: list[Verdict], quotas: dict[str, dict], now: datetime) -> dict:
    blocked = [v for v in verdicts if v.status == BLOCKED]
    lines = "\n".join(f"• `{v.brief_id}` {v.client} · {KIND_LABEL[v.kind].lower()}: {one_line(v)}" for v in blocked) or "None"
    quota_lines = "\n".join(
        f"• {client}: {quota_line(q)}" + (" · *full*" if any(q[k]["used"] >= q[k]["plan"] for k in q) else "")
        for client, q in quotas.items()
    )
    blocks = [
        {"type": "header", "text": {"type": "plain_text", "text": f"Production gate · {squad} · {now:%a %d %b %H:%M} UTC"}},
        {"type": "section", "fields": [
            {"type": "mrkdwn", "text": f"*Checked*\n{len(verdicts)}"},
            {"type": "mrkdwn", "text": f"*Queued*\n{len(verdicts) - len(blocked)}"},
            {"type": "mrkdwn", "text": f"*Blocked*\n{len(blocked)}"},
        ]},
        {"type": "section", "text": {"type": "mrkdwn", "text": "*Blocked (clarify with the client today)*\n" + lines}},
        {"type": "section", "text": {"type": "mrkdwn", "text": "*This month's quota after this run*\n" + quota_lines}},
    ]
    return {"channel": f"#{slug(squad)}", "text": f"Gate: {len(blocked)} of {len(verdicts)} briefs blocked", "blocks": blocks}


# Markdown report -----------------------------------------------------------------------------
def markdown_report(verdicts: list[Verdict], quotas: dict[str, dict], stats: dict, now: datetime) -> str:
    blocked = [v for v in verdicts if v.status == BLOCKED]
    out = [
        f"# Production gate run · {now:%A %d %B %Y, %H:%M} UTC",
        "",
        f"{len(verdicts)} briefs checked: **{len(verdicts) - len(blocked)} queued**, **{len(blocked)} blocked**.",
        f"Brain-rule checks: {stats['cache_hits']} from cache, {stats['live_calls']} live model calls, "
        f"{stats['unchecked']} unchecked (sent to human review).",
        "",
        "| Brief | Client | Result | Reasons |",
        "|---|---|---|---|",
    ]
    for v in verdicts:
        result = "Queued" + (f" ({', '.join(v.approvals)} approved)" if v.approvals else "") if v.status != BLOCKED else KIND_LABEL[v.kind]
        out.append(f"| {v.brief_id} | {v.client} | {result} | {short_reason(v) or '-'} |")

    out += ["", "## Quota after this run", ""]
    out += [f"- {client}: {quota_line(q)}" for client, q in quotas.items()]

    out += ["", "## Blocked briefs", ""]
    for v in blocked:
        out += [f"### {v.brief_id} · {v.title} ({v.client}, {KIND_LABEL[v.kind].lower()})", ""]
        out += [f"- Rule {r.rule} `{r.code}`: {r.detail}" for r in v.reasons]
        if v.client_message:
            out += ["", f"Draft for #ext-{slug(v.client)}:", "", "> " + v.client_message.replace("\n", "\n> ")]
        if v.client_message_if_declined:
            out += ["", "If the Squad Lead doesn't approve, send the client:", "", "> " + v.client_message_if_declined.replace("\n", "\n> ")]
        if v.kind == "internal":
            out += ["", "No client message: an internal owner decides."]
        out.append("")
    return "\n".join(out)


def group_by_squad(verdicts: list[Verdict]) -> dict[str, list[Verdict]]:
    groups = defaultdict(list)
    for v in verdicts:
        groups[v.squad].append(v)
    return dict(groups)
