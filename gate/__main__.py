"""Run the production gate on a batch of briefs and write the outputs.

    python -m gate                         # test data, cached Brain answers only
    python -m gate --live                  # also call the model on cache misses
    python -m gate --now 2026-10-14T09:00:00Z
"""

import argparse
import json
from dataclasses import asdict
from datetime import datetime
from pathlib import Path

from . import render
from .preview import preview_html
from .brain import BrainChecker
from .gate import Gate

ROOT = Path(__file__).resolve().parent.parent


def load(data_dir: Path) -> tuple[list[dict], dict[str, dict]]:
    briefs = json.loads((data_dir / "briefs.json").read_text(encoding="utf-8"))
    clients = json.loads((data_dir / "clients.json").read_text(encoding="utf-8"))
    return briefs, {c["client"]: c for c in clients}


def write_json(path: Path, data) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--data", type=Path, default=ROOT / "data" / "option_b_gate")
    parser.add_argument("--out", type=Path, default=ROOT / "out")
    parser.add_argument("--cache", type=Path, default=ROOT / "cache" / "brain_cache.json")
    parser.add_argument("--now", type=lambda s: datetime.fromisoformat(s.replace("Z", "+00:00")), default=None)
    parser.add_argument("--live", action="store_true", help="call the model on Brain-cache misses (needs Anthropic credentials)")
    args = parser.parse_args(argv)

    briefs, clients = load(args.data)
    brain = BrainChecker(cache_path=args.cache, live=args.live)
    gate = Gate(clients, brain, now=args.now)
    verdicts = gate.run(briefs)
    now = gate.now

    quotas = {name: gate.quota_snapshot(name) for name in clients}
    rows = []
    for v in verdicts:
        row = asdict(v)
        row["kind"] = v.kind
        rows.append(row)
    results = {
        "checked_at": now.isoformat(),
        "summary": {
            "checked": len(verdicts),
            "queued": sum(v.status == "PASS" for v in verdicts),
            "blocked": sum(v.status == "BLOCKED" for v in verdicts),
            "brain": brain.stats,
        },
        "quota_after_run": quotas,
        "briefs": rows,
    }
    clickup = [render.clickup_action(v, now) for v in verdicts]
    write_json(args.out / "results.json", results)
    write_json(args.out / "clickup_actions.json", clickup)
    for squad, group in render.group_by_squad(verdicts).items():
        squad_quotas = {name: q for name, q in quotas.items() if clients[name]["squad"] == squad}
        write_json(args.out / "slack" / f"digest_{render.slug(squad)}.json", render.slack_digest(squad, group, squad_quotas, now))
    write_json(args.out / "slack" / "alerts.json", [render.slack_alert(v) for v in verdicts if v.status == "BLOCKED"])
    (args.out / "report.md").write_text(render.markdown_report(verdicts, quotas, brain.stats, now), encoding="utf-8")
    squad_of = {name: c["squad"] for name, c in clients.items()}
    (args.out / "preview.html").write_text(preview_html(results, clickup, squad_of), encoding="utf-8")

    blocked = [v for v in verdicts if v.status == "BLOCKED"]
    print(f"{len(verdicts)} briefs: {len(verdicts) - len(blocked)} queued, {len(blocked)} blocked. Outputs in {args.out}")
    for v in blocked:
        print(f"  {v.brief_id:6} {v.client:16} {render.short_reason(v)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
