# Option B: Production gate · NOTES

**Result on the test data:** 30 briefs, 19 queued, 11 blocked, which matches the answer key I wrote before writing the gate (`expected/gate_expected.json`). The gate makes 29 Brain-rule checks and no other model calls. The paused client never reaches the model.

| Blocked | Why | Who acts |
|---|---|---|
| BR-02 | Hazelnut Tin discontinued | client |
| BR-03 | "barista pours into a takeaway cup" breaks "never a generic cup" | client |
| BR-06 | "before and after" | client |
| BR-10 | no formats, no platforms | client |
| BR-11 | 50% off, cap 30% | client |
| BR-15 | due in 1 business day; "rush ok" came from Juliana, not Louise | Squad Lead (or client moves the date) |
| BR-16 | Pawfect videos would be 6/4; BR-18's overage approval doesn't cover it | Squad Lead (or client) |
| BR-19 | "clinically proven", "cure", "insomnia" | client |
| BR-22 | Brightside paused (overdue invoice) | finance, nothing to the client |
| BR-25 | "a cura para a pele seca" ("cura" is banned, in Portuguese) | client |
| BR-29 | "the best-tasting subscription in the UK" is an unproven superlative | client |

To see it: `npm install && npm run gate`, then open `out/preview.html`. It shows each squad's digest, every brief's ClickUp task, the `#int` alert and the client draft, all built from the run output. Tests: `npm test` (82 tests).

The gate is written in TypeScript, the same language as the Studio and the internal apps, so the team and its coding agents can maintain it. It runs on Node with no build step.

These look wrong but pass:
- **BR-04 and BR-18:** the Squad Lead approved them (rush and overage).
- **BR-05 and BR-12:** the discount equals the cap.
- **BR-08:** has no Drive link, but uses Studio shots.
- **BR-09:** is written in Portuguese.
- **BR-14:** says "water-resistant", which isn't "waterproof".
- **BR-23:** has exactly 5 business days.
- **BR-26:** "the chicken jerky" resolves to the catalog product.
- **BR-27, BR-28 and BR-30:** each brief lands exactly on its plan limit.

---

## 1. Approach, and why it's the cheapest reliable way

The Definition of Ready is mostly arithmetic and lookups:
- client status,
- required fields,
- business days,
- catalog membership,
- a Drive link,
- banned phrases,
- discount percentages,
- quota counts.

All of that is plain code. It's deterministic, testable, costs nothing to run, and an LLM would only add cost and a chance of being wrong about dates and numbers.

One check needs language understanding: the client's free-text **Brain rules**, such as "Always show the can or bag, never a generic cup" or "No superlatives we can't prove". A regex can't tell that "barista pours into a takeaway cup" breaks the first rule, or that "the best-tasting subscription in the UK" breaks the second. That check, and only that check, goes to a **cheap model** (Claude Haiku 5.5), once per brief. The model:
- returns structured JSON (`violates` / `ok` / `unsure` plus the words it objects to),
- never decides a number,
- has its answers cached by a hash of (model, client, rules, copy), so re-running the gate on an unchanged brief costs nothing.

**Failing closed.** If the model is unsure, skips a rule, times out or isn't configured, the brief is blocked for a person to look at ("Needs review"). It is never passed silently.

**How the gate runs:**
- **Order:** briefs are checked in `created_at` order.
- **All reasons at once:** every rule runs and every reason is collected, so the client gets one message with everything to fix rather than a second round tomorrow.
- **Quota:** blocked briefs don't use quota. Passed briefs do, so later briefs in the batch see them.
- **Messages:** client messages are templates, not LLM text. A Squad Lead posts them, so they need to be predictable. Each block gets one of three labels so the Squad Lead knows who has to act:
  - *Blocked*: the client must change something.
  - *Needs approval*: the Squad Lead can unblock it alone, with a pre-written "if you decline, send this" message for the client.
  - *Blocked (internal)*: finance or human review, and nothing goes to the client.

## 2. Tool per job

| Part | Level chosen | Why the cheaper levels weren't enough |
|---|---|---|
| Trigger when a brief is created or edited | **ClickUp native automation** (status/creation → webhook) | It is the cheapest level. Code can't see ClickUp events without polling. |
| Rule 1 client active, rule 2 required fields, rule 3 business days and rush approval, rule 4 catalog and aliases, rule 5 assets, rule 7 quota and overage approval | **Code** | Nothing here needs judgment. Native ClickUp automations can't count business days, look up a catalog, read another client's plan or add up a batch, so these can't stay at the automation level. |
| Rule 6: banned phrases (whole words, PT/EN) and discount cap | **Code** (regex) | Word-boundary matching catches "cura", "before-and-after" and "WATERPROOF" without matching "secure" or "water-resistant". |
| Rule 6: client Brain rules (free text) | **Cheap API model**, Claude Haiku 5.5, cached, structured output | Rules are written in prose and change per client. Keywords can't judge "generic cup" or "superlative we can't prove", and writing code per rule doesn't scale to 25 clients. A frontier model isn't needed for a yes/no on two short sentences. |
| Client clarification draft | **Code** (templates per reason) | The wording must be predictable, and a person reviews it anyway. An LLM would add cost and variance for no gain. |
| Set status, custom field and comment in ClickUp; alert in `#int-<client>` | **Code** (ClickUp and Slack APIs) | These are API calls. |
| Daily 09:00 digest per squad | **Scheduled script** (Vercel cron) | Counting. |
| Morning briefing for Squad Leads | **Team-lead bot template** reads the gate's results | The bot already runs. It reads "3 briefs blocked, 1 needs your approval" as data, so the bot does no gate work and adds nothing to its cost. |
| Frontier model, Grok Bot | **Not used** | No part of the gate needs multi-tool reasoning. |

## 3. Where the LLM is used, and what it costs

- **Model:** Claude Haiku 5.5 (`claude-haiku-5-5`, list price $0.10 / $0.50 per million input/output tokens), effort `low`, JSON-schema output.
- **What for:** one call per brief that reaches rule 6 with Brain rules on file, answering "does this copy break any of these rules?".
- **Per call, measured on a live run (2026-10-19, 29 calls):** 913 input tokens (system prompt with examples, the client's rules, the copy) and 59 output tokens. That's **$0.00012 per call** at list price, or **$0.001 per call** with the test's standard assumption. The live answers are in `cache/live_run.json`.

| | Calls/month | Cost/month (test assumption, $0.001/call) | At Haiku list price |
|---|---|---|---|
| ~400 briefs, plus ~50% re-checks after edits (unchanged copy is a cache hit) | ~600 | **~$0.60** | ~$0.07 |
| Same at ~25 clients (400 briefs/month is already the real-company figure) | ~600 | ~$0.60 | ~$0.07 |
| Everything else (ClickUp automation ~600 of 10,000 actions, Vercel function and cron, Slack) | | ~$0 | |
| **Total** | | **≈ $1/month** | |

**Per-lead multiplier: the gate in this design vs. the gate inside each team-lead bot** (Grok Bot run ≈ $0.25, a template running 10 times a day):

| | 3 leads (today) | 6 leads (~25 clients) |
|---|---|---|
| This design: gate as a function; bots only read the "Gate result" field they already see | **≈ $1/month** (doesn't grow with leads) | **≈ $1/month** |
| One Grok Bot run per brief (400 briefs) | $100/month | $100/month |
| Gate logic in the lead template, polling (leads × 10 runs/day × 30 × $0.25) | $225/month | **$450/month** |

The bot versions are also less reliable: dates and quota would be "reasoned" by a model instead of computed.

**Cheaper alternative I looked at:**
- **TypeSafe's Jev** is a typed-decision model with yes/no outputs and probabilities, at about $0.04 per million input tokens. It would bring the model cost to about $0.01/month.
- I didn't use it because access is waitlisted and its accuracy claims come from the vendor. The saving is about $0.50/month.
- It plugs in by replacing `BrainChecker.askModel` in `src/brain.ts`. I'd switch only if it gets every case in `expected/gate_expected.json` right (`npm run compare` does that comparison).

## 4. Where it should live

**A mix of ClickUp automation, a small serverless function on our stack, and the existing Slack and ClickUp surfaces. Not the Studio, and not a Grok Bot.**

```
Brief created / moved to "Brief ready" in ClickUp
  └─ ClickUp native automation → webhook
       └─ Vercel function: gate (this code) ── Supabase: client plans, month usage, catalog, Brain-rule cache
            ├─ PASS    → ClickUp: status Queued, "Gate result" field, comment
            └─ BLOCKED → ClickUp: status Blocked + comment
                         Slack #int-<client>: reasons + draft for #ext-<client> (Squad Lead posts it)
Vercel cron 09:00 → digest per squad in #squad-a / #squad-b; re-checks edited Blocked briefs
Team-lead bot template → reads the "Gate result" field for the morning briefing
```

- **Trigger:** ClickUp automations are the cheapest trigger and are already paid for.
- **Gate logic:** the gate is deterministic code, so it belongs in a function, not in an agent.
- **Studio untouched:** the gate only reads the catalog, which in production would come from the Studio's API instead of `clients.json`. No Studio PR is needed.
- **Production quota:** in production the gate checks one brief at a time from the webhook. "Already let through in this batch" becomes "already queued this month", read from Supabase. The quota code is the same.
- **Not built (would need a Slack app):** the alert buttons (*Approve rush*, *Approve overage*, *Post to client channel*, *Override block*) would write the approval to a ClickUp custom field and re-run the gate. That replaces reading approvals out of free-text comments, which is the most fragile part of the gate today.

## 5. Assumptions about unclear data

1. **Check time:** "today" is Tue 2026-10-13 09:00 UTC (`--now` changes it).
2. **Business days:** the check day is day 0, business days are Mon–Fri, and there's **no holiday calendar** (none in the data; UK/US/BR holidays would be the first addition).
3. **Mixed briefs:** a brief with both statics and video needs the **5-day** video minimum.
4. **Who can approve a rush or overage:** only a comment by **that client's Squad Lead** (from `clients.json`), written before the check time.
   - It must mention rush or overage plus an approval word, with no negation.
   - "rush ok" from a designer doesn't count, and the alert says why.
   - A Squad Lead of another squad doesn't count.
5. **Overage scope:** an overage approval covers **only the brief it's on**, and that whole brief. I don't parse "1 video" out of the comment. The approved brief still counts against the quota, so Pawfect ends at 5/4 videos.
6. **Quota usage:** blocked briefs don't use quota. Passed briefs do, in `created_at` order. `used_this_month` excludes this batch.
7. **Which text is checked for claims:** the title and copy direction only. `notes` are internal instructions to the designer, and "no cure claims" in a note must not block.
8. **Discounts:** only a percentage tied to "off", "discount", "save" or "desconto" counts. A discount equal to the cap is allowed ("can't be above").
9. **Formats:** every format needs an aspect ratio, and a brief with video needs at least one format with a duration ("9:16 15s"). A 9:16 static is fine.
10. **Product matching:** products are matched **inside that client's catalog**, by SKU, name or alias. Matching ignores case and extra spaces and drops a leading "the/a/our". There's no fuzzy matching: an unknown name becomes a question to the client, not a guess. `"brand"` means brand-only work.
11. **Assets:** `use_studio_catalog: true` satisfies the assets rule. I don't check that the Studio actually has shots for that SKU.
12. **Paused client:** this is an internal block. Finance owns that conversation, so no message is drafted for the client and no model is called.
13. **What the model judges:** the model skips numeric Brain rules ("discounts capped at 30%"), because code checks those. When a Brain-rule hit quotes the same words as a banned phrase, the client is asked about it once.
14. **Two caches, on purpose.** `cache/brain_cache.json` is a **hand-labelled** answer set (marked `"source": "hand-labelled seed"`): it is the test fixture, so `npm test` and `npm run gate` are deterministic and free. `cache/live_run.json` holds the **real Claude Haiku 5.5 answers** from `npm run gate:live` (needs `ANTHROPIC_API_KEY` in `.env`), compared with the key by `npm run compare -- out/live/results.json`.
    - **Result of the live run: 29 of 30 briefs match the key.** Every violation the key expects was found (BR-03's takeaway cup, BR-29's superlative, the banned-claim briefs), with the offending words quoted verbatim. The one difference is BR-30 (Halo, "Block the light, keep the calm"): the model answered *unsure* against "Wellness, not medical", so the gate sent it to human review instead of queueing it. That is the fail-closed behaviour working as designed; a person decides in seconds.
    - **What the live run taught me:** the first prompt made the model answer *unsure* for "Always show the can or bag" on every Northpeak brief whose copy described no imagery (6 of 9), because a static will show *something*. Telling the model that silence is never a violation, with four short examples, fixed it. Prompt changes bump `PROMPT_VERSION`, which is part of the cache key, so stale answers are never reused.
15. **Language:** client messages are in English (US/UK clients), even when the brief was written in Portuguese.

## What breaks it, and how I'd monitor it

- **Approvals worded in a new way** ("pode ir", "fine by me"): they're missed and the brief stays blocked. That fails safe, but it's annoying. Fix: the approval buttons and custom field above. Watch: rush blocks that the Squad Lead overrides.
- **Model drift or false positives:** track the weekly Brain-rule block rate, the *unsure* rate and the *Override block* rate. Re-run `npm run gate:live` and `npm run compare` on a growing answer key before changing model or prompt; the live run above is the baseline (29/30, one *unsure*).
- **Model API down:** the count of `unchecked` in `results.json` goes up and briefs pile up in "Needs review". Alert if it's above 0 for an hour.
- **Stale catalog:** a spike in `product_unknown` means the catalog sync broke, not the clients.

## What I chose not to build

- **Slack interactivity and real API adapters:** this would be a platform, and dry-run payloads show the same thing.
- **Holiday calendars.**
- **Fuzzy product matching:** a wrong guess is worse than a question.
- **Checking images or Studio assets.**
- **LLM-written client messages.**
