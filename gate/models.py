from dataclasses import dataclass, field

# Who has to act on a reason before the brief can move:
#   client   - the client must change or confirm something
#   approval - the Squad Lead can unblock it (rush, overage), or ask the client
#   internal - an internal owner decides (finance pause, human review of copy)
AUDIENCES = ("client", "approval", "internal")

PASS = "PASS"
BLOCKED = "BLOCKED"


@dataclass
class Reason:
    rule: int
    code: str
    audience: str
    detail: str
    client_ask: str | None = None
    evidence: str | None = None


@dataclass
class BrainVerdict:
    rule: str
    verdict: str  # "violates" | "ok" | "unsure"
    evidence: str = ""


@dataclass
class Verdict:
    brief_id: str
    client: str
    squad: str
    squad_lead: str
    title: str
    due_date: str | None
    deliverables: dict
    status: str = PASS
    reasons: list[Reason] = field(default_factory=list)
    checks: dict[str, str] = field(default_factory=dict)
    approvals: list[str] = field(default_factory=list)
    notes: list[str] = field(default_factory=list)
    skus: list[str] = field(default_factory=list)
    business_days: int | None = None
    quota_after: dict | None = None
    brain_source: str | None = None
    client_message: str | None = None
    client_message_if_declined: str | None = None

    @property
    def kind(self) -> str | None:
        """The most client-facing audience among the reasons, or None on PASS."""
        audiences = {r.audience for r in self.reasons}
        return next((a for a in AUDIENCES if a in audiences), None)
