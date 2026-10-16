"""Compare a gate run with the answer key. Used to check a live model run:

    python -m gate --live --cache cache/live_run.json --out out/live
    python scripts/compare_to_key.py out/live/results.json
"""

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent


def main(results_path: str) -> int:
    key = json.loads((ROOT / "expected" / "gate_expected.json").read_text(encoding="utf-8"))
    key.pop("_comment")
    results = json.loads(Path(results_path).read_text(encoding="utf-8"))["briefs"]
    mismatches = 0
    for row in results:
        want = key[row["brief_id"]]
        got_codes = sorted({r["code"] for r in row["reasons"]})
        if row["status"] != want["status"] or got_codes != sorted(want["codes"]):
            mismatches += 1
            print(f"{row['brief_id']}: got {row['status']} {got_codes}, expected {want['status']} {want['codes']} ({want['why']})")
    print(f"{len(results) - mismatches}/{len(results)} briefs match the answer key")
    return 1 if mismatches else 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1] if len(sys.argv) > 1 else str(ROOT / "out" / "results.json")))
