"""The production gate: Definition of Ready rules 1-7, applied to a batch of briefs.

Everything here is plain code except rule 6's Brain-rule check, which is
delegated to a BrainChecker (cached cheap-model call). The LLM never decides
dates, counts, quotas or discounts.
"""

import re
from datetime import date, datetime

from . import approvals, claims, config, messages, products
from .business_days import add_business_days, business_days_between
from .models import BLOCKED, PASS, Reason, Verdict

_ASPECT_RATIO = re.compile(r"^\s*\d+(?:\.\d+)?:\d+(?:\.\d+)?\b")
_DURATION = re.compile(r"\b\d+\s?s\b", re.IGNORECASE)
KINDS = ("statics", "videos")


def copy_text(brief: dict) -> str:
    """The client-facing words we check for claims. Notes are internal
    instructions to the designer and are not checked."""
    return " ".join(filter(None, [brief.get("title"), brief.get("copy_direction")]))


def _due(brief: dict) -> date | None:
    try:
        return date.fromisoformat(brief["due_date"])
    except (KeyError, TypeError, ValueError):
        return None


def _counts(brief: dict) -> dict[str, int]:
    deliverables = brief.get("deliverables") or {}
    return {k: int(deliverables.get(k) or 0) for k in KINDS}


class Gate:
    def __init__(self, clients: dict[str, dict], brain_checker, now: datetime | None = None):
        self.clients = clients
        self.brain = brain_checker
        self.now = now or config.DEFAULT_CHECK_TIME
        self.today = self.now.date()
        # Rule 7: what this batch has already let through, per client.
        self.accepted = {name: {k: 0 for k in KINDS} for name in clients}
        self._indexes = {name: products.build_index(c.get("catalog", [])) for name, c in clients.items()}

    def run(self, briefs: list[dict]) -> list[Verdict]:
        ordered = sorted(briefs, key=lambda b: b["created_at"])
        return [self.check(brief) for brief in ordered]

    def check(self, brief: dict) -> Verdict:
        client = self.clients.get(brief["client"])
        if client is None:
            raise ValueError(f"{brief['id']}: unknown client {brief['client']!r}")
        v = Verdict(
            brief_id=brief["id"],
            client=client["client"],
            squad=client["squad"],
            squad_lead=client["squad_lead"],
            title=brief.get("title", ""),
            due_date=brief.get("due_date"),
            deliverables=_counts(brief),
        )
        self._rule1_active(client, v)
        self._rule2_fields(brief, v)
        self._rule3_turnaround(brief, client, v)
        self._rule4_products(brief, client, v)
        self._rule5_assets(brief, v)
        self._rule6_claims(brief, client, v)
        self._rule7_quota(brief, client, v)

        v.status = BLOCKED if v.reasons else PASS
        if v.status == PASS:
            for k in KINDS:
                self.accepted[client["client"]][k] += v.deliverables[k]
        v.quota_after = self.quota_snapshot(client["client"])
        messages.attach(v)
        return v

    def quota_snapshot(self, client_name: str) -> dict:
        client = self.clients[client_name]
        return {
            k: {
                "used": client["used_this_month"][k] + self.accepted[client_name][k],
                "plan": client["plan_per_month"][k],
            }
            for k in KINDS
        }

    # Rule 1 -----------------------------------------------------------------
    def _rule1_active(self, client: dict, v: Verdict) -> None:
        if client.get("status") == "active":
            v.checks["1 client active"] = "ok"
            return
        v.checks["1 client active"] = "failed"
        v.reasons.append(Reason(
            rule=1, code="client_paused", audience="internal",
            detail=f"{client['client']} is {client.get('status')}: "
                   f"{client.get('paused_reason', 'no reason on file')}",
        ))

    # Rule 2 -----------------------------------------------------------------
    def _rule2_fields(self, brief: dict, v: Verdict) -> None:
        missing = []
        if not brief.get("platforms"):
            missing.append("platforms")
        formats = brief.get("formats") or []
        if not formats or not all(_ASPECT_RATIO.match(f) for f in formats):
            missing.append("formats (aspect ratio)")
        if formats and v.deliverables["videos"] and not any(_DURATION.search(f) for f in formats):
            missing.append("video duration")
        if not any(v.deliverables.values()):
            missing.append("deliverable counts")
        if _due(brief) is None:
            missing.append("due date")
        if not brief.get("products"):
            missing.append('products (or "brand")')

        if not missing:
            v.checks["2 required fields"] = "ok"
            return
        v.checks["2 required fields"] = "failed"
        v.reasons.append(Reason(
            rule=2, code="missing_fields", audience="client",
            detail="Missing: " + ", ".join(missing) + ".",
            client_ask="Could you confirm the " + messages.human_join(missing) + " for this brief?",
        ))

    # Rule 3 -----------------------------------------------------------------
    def _rule3_turnaround(self, brief: dict, client: dict, v: Verdict) -> None:
        due = _due(brief)
        if due is None:
            v.checks["3 turnaround"] = "skipped (no due date)"
            return
        has_video = v.deliverables["videos"] > 0
        minimum = config.MIN_BUSINESS_DAYS_VIDEO if has_video else config.MIN_BUSINESS_DAYS_STATIC
        v.business_days = business_days_between(self.today, due)
        if v.business_days >= minimum:
            v.checks["3 turnaround"] = "ok"
            return

        lead_ok, others = approvals.find_approval(brief.get("comments", []), "rush", client["squad_lead"], self.now)
        if lead_ok:
            v.checks["3 turnaround"] = "ok (rush approved)"
            v.approvals.append("rush")
            v.notes.append(f"Rush approved by {lead_ok['by']}: \"{lead_ok['text']}\"")
            return

        earliest = add_business_days(self.today, minimum)
        detail = (f"Due {due:%a %d %b} is {v.business_days} business day(s) out; "
                  f"{'video' if has_video else 'statics'} need {minimum}. Earliest normal date: {earliest:%a %d %b}.")
        if others:
            names = ", ".join(sorted({c["by"] for c in others}))
            detail += f" {names} said rush ok, but only the Squad Lead ({client['squad_lead']}) can approve a rush."
        v.checks["3 turnaround"] = "failed"
        v.reasons.append(Reason(
            rule=3, code="turnaround", audience="approval", detail=detail,
            client_ask=f"Could we move the due date to {earliest:%A %d %B}? That gives the team the time this needs.",
        ))

    # Rule 4 -----------------------------------------------------------------
    def _rule4_products(self, brief: dict, client: dict, v: Verdict) -> None:
        names = brief.get("products") or []
        if not names:
            v.checks["4 products"] = "skipped (no products)"
            return
        index = self._indexes[client["client"]]
        ok = True
        for name in names:
            if products.is_brand_only(name):
                continue
            item = products.resolve(name, index)
            if item is None:
                ok = False
                v.reasons.append(Reason(
                    rule=4, code="product_unknown", audience="client",
                    detail=f"'{name}' is not in {client['client']}'s catalog.",
                    client_ask=f"We couldn't find '{name}' in your product catalog. Which product (or SKU) is this?",
                ))
            elif not item.get("active", True):
                ok = False
                note = f" ({item['note']})" if item.get("note") else ""
                v.reasons.append(Reason(
                    rule=4, code="product_inactive", audience="client",
                    detail=f"{item['name']} [{item['sku']}] is not active{note}.",
                    client_ask=f"Our catalog shows {item['name']} as no longer available. "
                               f"Should we feature a different product instead?",
                ))
            else:
                v.skus.append(item["sku"])
        v.checks["4 products"] = "ok" if ok else "failed"

    # Rule 5 -----------------------------------------------------------------
    def _rule5_assets(self, brief: dict, v: Verdict) -> None:
        link = (brief.get("assets_link") or "").strip()
        if link.startswith("http") or brief.get("use_studio_catalog"):
            v.checks["5 assets"] = "ok" if link else "ok (Studio catalog shots)"
            return
        v.checks["5 assets"] = "failed"
        v.reasons.append(Reason(
            rule=5, code="assets_missing", audience="client",
            detail="No Drive link and no note to use Studio catalog shots.",
            client_ask="Could you share a Drive link with the assets, or confirm we should use the product shots we already have?",
        ))

    # Rule 6 -----------------------------------------------------------------
    def _rule6_claims(self, brief: dict, client: dict, v: Verdict) -> None:
        text = copy_text(brief)
        before = len(v.reasons)

        banned = claims.find_banned(text, client.get("banned_claims", []))
        for phrase in banned:
            v.reasons.append(Reason(
                rule=6, code="banned_claim", audience="client", evidence=phrase,
                detail=f"Copy uses banned claim '{phrase}'.",
                client_ask=f"The copy includes \"{phrase}\", which is on the list of claims we've agreed not to use. "
                           f"Could you share an alternative line?",
            ))

        discount = claims.max_discount(text)
        cap = client.get("max_discount_pct")
        if discount is not None and cap is not None and discount > cap:
            v.reasons.append(Reason(
                rule=6, code="discount_over_cap", audience="client",
                detail=f"Discount of {discount:g}% is above the {cap}% cap.",
                client_ask=f"The brief says {discount:g}% off, but our agreed cap is {cap}%. "
                           f"Should we go with {cap}% (or lower)?",
            ))

        # The Brain-rule check is the only LLM step. Skip it when it can't
        # change anything: paused client, or no Brain rules on file.
        rules = client.get("brain_rules", [])
        if client.get("status") != "active" or not rules or not text.strip():
            v.checks["6 claims"] = "failed" if len(v.reasons) > before else "ok (Brain check skipped)"
            return

        verdicts, v.brain_source = self.brain.check(client["client"], text, rules)
        for bv in verdicts:
            if bv.verdict == "violates":
                v.reasons.append(Reason(
                    rule=6, code="brain_rule", audience="client", evidence=bv.evidence,
                    detail=f"Breaks Brain rule \"{bv.rule}\" ({bv.evidence!r}).",
                    client_ask=f"\"{bv.evidence}\" goes against a brand rule we have on file "
                               f"(\"{bv.rule.rstrip('.')}\"). Could you share an alternative?",
                ))
            elif bv.verdict == "unsure":
                v.reasons.append(Reason(
                    rule=6, code="brain_unsure", audience="internal", evidence=bv.evidence,
                    detail=f"Couldn't confirm the copy follows \"{bv.rule}\". A person should check it.",
                ))
        v.checks["6 claims"] = "failed" if len(v.reasons) > before else "ok"

    # Rule 7 -----------------------------------------------------------------
    def _rule7_quota(self, brief: dict, client: dict, v: Verdict) -> None:
        name = client["client"]
        over = []
        for k in KINDS:
            if not v.deliverables[k]:
                continue
            total = client["used_this_month"][k] + self.accepted[name][k] + v.deliverables[k]
            plan = client["plan_per_month"][k]
            if total > plan:
                over.append((k, total, plan))
        if not over:
            v.checks["7 quota"] = "ok"
            return

        lead_ok, _ = approvals.find_approval(brief.get("comments", []), "overage", client["squad_lead"], self.now)
        if lead_ok:
            v.checks["7 quota"] = "ok (overage approved)"
            v.approvals.append("overage")
            v.notes.append(f"Overage approved by {lead_ok['by']}: \"{lead_ok['text']}\"")
            return

        summary = "; ".join(f"{k} {total}/{plan}" for k, total, plan in over)
        v.checks["7 quota"] = "failed"
        v.reasons.append(Reason(
            rule=7, code="quota_exceeded", audience="approval",
            detail=f"Would take {name} over this month's plan: {summary}.",
            client_ask=f"This would take you past this month's plan ({summary}). "
                       f"Should we schedule it for next month, or add it as extra work?",
        ))
