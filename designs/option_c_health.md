# Option C · Squad and employee health (one-page design)

Mockups of the outputs, using numbers computed from the real data: [option_c_screens.html](option_c_screens.html).

## Approach

A **scheduled script** runs on Monday at 07:00 BRT. It reads the ClickUp status history, the people sheet, PTO and the queue snapshots. Every number is computed in code:

| Metric | How it's computed |
|---|---|
| **Week** of a task | Week (Mon–Sun, UTC) of its *first* `Sent to Client` |
| **Late** | That date is after `due_date` |
| **Capacity** | Weekly points × availability: start date, PTO and sick days (pro rata over 5 days), ramp plan (Nathalia 50% for 4 weeks), contractor capacity (Mello 7). Leads have no capacity points and are excluded from load. |
| **Load** | Points delivered ÷ capacity. Points are credited to the final assignee; reassignments are listed so the Squad Lead sees them. |
| **After-hours** | The person's *own* status changes outside 08:00–20:00 **in their own time zone**, or on weekends. Mello is in Lisbon, the rest are in São Paulo. |
| **Quality** | `internal_error` revisions and QC returns per task. `client_change` counts as a client signal, not the person's. |
| **Squad demand** | Points delivered + queue growth, with the oldest queued item from the snapshots |

**Who sees what:**
- **Founders** get one message with **squad aggregates only**: load, backlog trend, on-time rate, and whether the squad needs help.
- **Each Squad Lead** gets a **private DM** about **their own people only**, with every flag and the reason behind it. Nobody else sees per-person data, and there's no ranking.
- Bea is both Squad Lead and Creative Lead, so she receives Squad B's.

## Thresholds (in config, tuned with the leads)

- **Overloaded:** load ≥ 115% for 2 weeks in a row, or ≥ 130% once.
- **After-hours:** ≥ 3 actions in a week, or any action between 00:00 and 06:00.
- **Quality:** ≥ 0.3 internal errors per task.
- **Slipping:** ≥ 2 late tasks in a week.
- **Squad needs help:** the queue grew 3 weeks in a row and the oldest item is > 3 days old, or load ≥ 110% for 2+ weeks after PTO adjustment.

## What the data says

| | Finding | Action |
|---|---|---|
| **Squad B** | **Needs help.** 100% on time and ~100% load, but the queue went 5 → 9 → 13 → 18 and the oldest item is 6 days old. Bea is Squad Lead *and* Creative Lead ("Need help", 7 Oct). | The on-time rate hides that demand is above capacity. Add a designer or a separate Creative Lead. |
| **Squad A** | **Watch.** Load was 96 → 110 → 117 → 120% while Lucas was on PTO. Late tasks went 3 → 1 → 3 → 4. | The extra load was absorbed by one person. Lucas is back on the 12th: rebalance, don't hire yet. |
| **Danilo** | Overloaded and slipping: 15 → 18 → 24 → 26 points against 14, 10 of 31 tasks late, 24 after-hours and 7 weekend actions, 7 between 00:00 and 06:00, "virando a noite de novo". He received 5 of Layla's cut-downs. | Check-in this week |
| **Juliana** | Quality: 17 internal errors and 20 QC returns on 38 tasks ("fixed the logo again on Lumen"). She is not overloaded (14/14). | Coaching or a brand checklist, not a workload change |
| **Lucas** | 0 points for two weeks because of PTO | Not flagged |
| **Nathalia** | 5 → 8 → 7 against a 50% ramp of 7: on track | Positive note |
| **Mello** | 6 of 7, contractor | No flag |
| **Gabi** | His "render queued overnight" message is a machine working, not him (0 after-hours actions) | No flag |
| **Ana** | Her heavy revisions are Brightside's 20 client changes | A client problem, not hers |

## Tool per job

| Part | Level | Why not cheaper |
|---|---|---|
| Weekly aggregation, capacity, load, late, after-hours, quality, thresholds | **Code** (scheduled script) | Counting and dates. An LLM must never produce these numbers. |
| Pull ClickUp history | **Code** (API) | ClickUp automations can't aggregate. |
| Tag internal Slack messages as distress / overload / neutral ("virando a noite", "can't take more", "Need help"), quoted as supporting evidence only | **Cheap model** (Haiku 5.5) | Tone, slang and Portuguese are beyond keywords, but it's a short classification. It never changes a score. |
| Check-in talking points for already-flagged people, inside the **Squad Lead bot template** | **Grok Bot** (existing template, weekly) | Judgment across ClickUp and Slack, done only for the 1–3 people code flagged. |
| Founders and Squad Lead messages | **Code templates** → Slack | Predictable. |

## Monthly cost

| Item | Cost |
|---|---|
| Script | ~$0 |
| Slack tagging: ~400 internal messages × $0.001 | ≈ **$0.40** |
| Talking points: 1 Grok run per lead per week × $0.25 | **3 leads ≈ $3.25**, **6 leads ≈ $6.50** |
| **Total** | **≈ $4–7/month** |

**For comparison:** a Grok Bot reading ClickUp for each person every week (12 × 4.3 × $0.50) would cost ≈ $26/month. A daily health run in every lead bot (6 × 10 × 30 × $0.25) would cost **$450/month**.

## Traps in real data

- **PTO, sick days and ramp-up** look like low output.
- **Reassignments** move points between people.
- **Time zones and DST** (Lisbon changes on 25 Oct) distort after-hours counts.
- **Bots, renders and scheduled sends** look like night work.
- **Repeated `Sent to Client`** must use only the first one.
- **Leads have no capacity points,** but their overload shows up as queue age.
- **Client churn** (Brightside's 20 changes) looks like a designer's quality problem.
- **People can be identified in small squads,** so per-person data must never reach founders or peers.

## First thing I'd build

**The capacity calendar** (start dates, PTO, sick days, ramp, contractors) **and the first-`Sent to Client` weekly aggregation.** Every flag depends on these two. Without them, Lucas looks idle and Nathalia looks slow.
