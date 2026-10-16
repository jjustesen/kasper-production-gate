"""Find Squad Lead approvals (rush, overage) in ClickUp comments."""

import re
from datetime import datetime

_TOPIC = {
    "rush": re.compile(r"\brush\b", re.IGNORECASE),
    "overage": re.compile(r"\b(overage|over quota|over the plan|extra)\b", re.IGNORECASE),
}
_APPROVE = re.compile(r"\b(approved?|ok|okay|go ahead|yes)\b", re.IGNORECASE)
_NEGATION = re.compile(r"\b(not|no|declined?|rejected?|can't|cannot)\b", re.IGNORECASE)


def _parse(ts: str) -> datetime:
    return datetime.fromisoformat(ts.replace("Z", "+00:00"))


def _is_approval(text: str, kind: str) -> bool:
    return bool(_TOPIC[kind].search(text) and _APPROVE.search(text) and not _NEGATION.search(text))


def find_approval(comments: list[dict], kind: str, squad_lead: str, now: datetime) -> tuple[dict | None, list[dict]]:
    """Return (the Squad Lead's approval comment or None, approvals by anyone else).

    Only comments written by the client's Squad Lead, at or before the check
    time, count. Approvals by other people are returned so the alert can say
    why they were ignored.
    """
    lead_approval = None
    others = []
    for comment in comments:
        if _parse(comment["at"]) > now or not _is_approval(comment["text"], kind):
            continue
        if comment["by"] == squad_lead:
            lead_approval = comment
        else:
            others.append(comment)
    return lead_approval, others
