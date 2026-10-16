# Kāsper "Definition of Ready": when a brief may enter production (Queued)

A brief may move into `Queued` only if all of these hold. Otherwise it is **blocked**, with a reason the Squad Lead can send to the client in one message.

1. **Client is active.** Paused clients get no new production.
2. **Required fields:** at least one platform, at least one format (aspect ratio, plus duration for video), deliverable counts, due date, and the products (or "brand" for brand-only work).
3. **Turnaround:** the due date is at least **3 business days** out for statics and **5 business days** for anything with video, counted from the day the brief is checked (Mon–Fri; today counts as day 0). A rush is allowed only if the client's **Squad Lead** approves it in a comment.
4. **Products exist and are active** in the client's catalog.
5. **Assets:** a Drive link, or a note that the Studio catalog shots should be used.
6. **Claims:** no phrase from the client's banned-claims list, and nothing that breaks the client's Brain rules. Discounts can't be above the client's maximum.
7. **Plan quota:** this month's usage, plus every brief already let through in this batch, plus this brief can't go over the plan. The exception is when the Squad Lead has approved an overage in a comment.

Notes:
- Briefs are checked in `created_at` order.
