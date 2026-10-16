# Kāsper AI Tech Lead test: Option B, production gate

Checks every new brief against the Definition of Ready and decides **PASS** (→ `Queued`) or **BLOCKED**. Every block comes with a reason, and where the client has to act, a ready-to-send clarification message. See [NOTES.md](NOTES.md) for the approach, costs and assumptions.

## Run

Needs Python 3.10+. There are no dependencies for the default run.

```bash
python -m gate
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
- `--now 2026-10-14T09:00:00Z` sets the check time.
- `--live` calls Claude Haiku 5.5 on Brain-rule cache misses. It needs `pip install anthropic` and Anthropic credentials.

## Test

```bash
pip install pytest
python -m pytest -q
```

The suite has 81 tests:
- the 30 briefs against the hand-written answer key in `expected/gate_expected.json`,
- per-rule edge cases (weekends, rush by a non-lead, quota order, blocked briefs not using quota, word boundaries, Portuguese claims),
- the Brain checker with a mocked API (caching, failing closed, skipped rules).

## Layout

```
gate/
  gate.py           Definition of Ready rules 1-7
  business_days.py  day-0 business-day maths
  products.py       SKU / name / alias resolution per client
  claims.py         banned phrases (whole words) and discount caps
  approvals.py      Squad Lead rush / overage approvals in comments
  brain.py          the one LLM step: Brain rules, cached, fails closed
  messages.py       client clarification templates
  render.py         ClickUp actions, Slack Block Kit, Markdown report
  preview.py        out/preview.html, a browsable view of the run
designs/
  option_a_onboarding.md   one-page design, Option A (onboarding)
  option_c_health.md       one-page design, Option C (squad health)
  option_*_screens.html    mockups of those designs' outputs, with the real data (not built)
cache/brain_cache.json   Brain-rule answers (hand-labelled seed, see NOTES §5)
expected/                answer key
scripts/compare_to_key.py  compare any run (e.g. a live model run) with the key
```
