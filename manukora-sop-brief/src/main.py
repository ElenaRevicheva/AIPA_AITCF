"""CLI entry point: load → metrics → rules → narrate → write output."""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from src.load import load_extract  # noqa: E402
from src.metrics import compute_all  # noqa: E402
from src.narrate import narrate  # noqa: E402
from src.rules import decide  # noqa: E402


def run(
    data_path: Path,
    out_dir: Path,
    *,
    prefer: str | None = None,
    skip_llm: bool = False,
) -> Path:
    rows = load_extract(data_path)
    metrics = compute_all(rows)
    decisions = decide(metrics)
    payload = decisions.to_payload()

    out_dir.mkdir(parents=True, exist_ok=True)
    (out_dir / "decision_payload.json").write_text(
        json.dumps(payload, indent=2), encoding="utf-8"
    )
    (out_dir / "metrics.json").write_text(
        json.dumps([m.to_dict() for m in metrics], indent=2), encoding="utf-8"
    )

    if skip_llm:
        import os

        # Temporarily hide keys so narrate() takes the template path.
        saved = {
            k: os.environ.pop(k)
            for k in list(os.environ)
            if k in {
                "OPENAI_API_KEY",
                "ANTHROPIC_API_KEY",
                "GROQ_API_KEY",
                "XAI_API_KEY",
                "GROK_API_KEY",
            }
        }
        try:
            result = narrate(payload, prefer=prefer)
        finally:
            os.environ.update(saved)
    else:
        result = narrate(payload, prefer=prefer)

    briefing_path = out_dir / "sop_briefing_2026-03.md"
    briefing_path.write_text(result.text + "\n", encoding="utf-8")

    run_log = {
        "provider": result.provider,
        "model": result.model,
        "guard_ok": result.guard_ok,
        "used_fallback_template": result.used_fallback_template,
        "failover_notice": result.failover_notice,
        "attempts": result.attempts,
        "reorder_count": len(decisions.reorder_queue),
        "top_reorder": (
            decisions.reorder_queue[0].sku if decisions.reorder_queue else None
        ),
    }
    (out_dir / "run_log.json").write_text(
        json.dumps(run_log, indent=2), encoding="utf-8"
    )

    print(f"Wrote {briefing_path}")
    print(
        f"Provider: {result.provider}/{result.model} | "
        f"reorders: {len(decisions.reorder_queue)} | "
        f"template={result.used_fallback_template}"
    )
    for a in result.attempts:
        print(f"  · {a}")
    if result.failover_notice:
        print(f"FAILOVER: {result.failover_notice}")
    return briefing_path


def main(argv: list[str] | None = None) -> int:
    p = argparse.ArgumentParser(description="Manukora S&OP briefing pipeline")
    p.add_argument(
        "--data",
        type=Path,
        default=ROOT / "data" / "mock_sales_inventory.csv",
    )
    p.add_argument("--out", type=Path, default=ROOT / "output")
    p.add_argument(
        "--prefer",
        choices=["openai", "anthropic", "groq", "xai"],
        default=None,
        help="Prefer this provider when its key is present",
    )
    p.add_argument(
        "--skip-llm",
        action="store_true",
        help="Force the deterministic template (offline / CI)",
    )
    args = p.parse_args(argv)
    run(args.data, args.out, prefer=args.prefer, skip_llm=args.skip_llm)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
