# Kāsper AI Tech Lead test: Option B, production gate

Checks every new brief against the Definition of Ready and decides **PASS** (→ `Queued`) or **BLOCKED**. Every block comes with a reason, and where the client has to act, a ready-to-send clarification message. See [NOTES.md](NOTES.md) for the approach, costs and assumptions.

It's written in TypeScript to match Kāsper's stack (Next.js, Supabase, Vercel). It runs directly on Node with no build step: Node 23.6 and later run `.ts` files natively.

## Run

Needs Node 23.6 or later.

```bash
npm install
npm run gate
```

This reads `data/option_b_gate/` and writes dry-run outputs to `out/`:

| File | What it is |
|---|---|
| `out/preview.html` | Open in a browser to see the run as people would: squad digests, each brief's ClickUp task, the `#int` alert and the client draft |
| `out/report.md` | Human-readable run: every brief, quota after the run, blocked briefs with client drafts |
| `out/results.json` | Full verdicts (reasons, checks, approvals, quota, messages) |
| `out/clickup_actions.json` | Status, custom field and comment to set on each ClickUp task |
| `out/slack/digest_squad-*.json` | Block Kit daily digest per squad channel |
| `out/slack/alerts.json` | Block Kit alert per blocked brief for `#int-<client>` |

Options:
- `npm run gate -- --now 2026-10-14T09:00:00Z` sets the check time.
- `npm run gate:live` calls Claude Haiku 5.5 for real, writing to `cache/live_run.json` and `out/live/`. Put your key in `.env` as `ANTHROPIC_API_KEY=...` (the file is git-ignored). Then `npm run compare -- out/live/results.json` checks it against the answer key.

## Test

```bash
npm test            # 82 tests (Vitest)
npm run typecheck   # tsc --noEmit
```

The suite covers:
- the 30 briefs against the hand-written answer key in `expected/gate_expected.json`,
- per-rule edge cases (weekends, rush by a non-lead, quota order, blocked briefs not using quota, word boundaries, Portuguese claims),
- the Brain checker with a mocked API (caching, failing closed, skipped rules).

## Layout

```
src/
  gate.ts                Definition of Ready rules 1-7
  dates.ts               day-0 business-day maths and date formatting
  products.ts            SKU / name / alias resolution per client
  claims.ts              banned phrases (whole words) and discount caps
  approvals.ts           Squad Lead rush / overage approvals in comments
  brain.ts               the one LLM step: Brain rules, cached, fails closed
  messages.ts            client clarification templates
  render.ts              ClickUp actions, Slack Block Kit, Markdown report
  preview.ts             out/preview.html (page in preview-template.html)
  models.ts, config.ts   data shapes and thresholds
  cli.ts                 reads the data, runs the gate, writes out/
tests/                   Vitest suites
designs/
  option_a_onboarding.md   one-page design, Option A (onboarding)
  option_c_health.md       one-page design, Option C (squad health)
  option_*_screens.html    mockups of those designs' outputs, with the real data (not built)
cache/brain_cache.json   Brain-rule answers (hand-labelled seed, see NOTES §5)
expected/                answer key
scripts/compare-to-key.ts  compare any run (e.g. a live model run) with the key
```
