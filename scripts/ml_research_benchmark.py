"""Run a deterministic synthetic-only ML pipeline benchmark on the graph host."""

import argparse
import json
import os
import time
from datetime import datetime, timedelta, timezone
from pathlib import Path

from service.ml_research import ResearchExample, train_reviewed_baseline


ASSETS = (("bitcoin", "btc"), ("ethereum", "eth"), ("ethereum", "usdt"),
          ("ethereum", "usdc"), ("bloch", "blch"))


def synthetic_examples(chain, asset):
    start = datetime(2026, 7, 1, tzinfo=timezone.utc)
    rows = []
    for index in range(120):
        label = int((index * 17 + 3) % 11 < 4)
        observed = start + timedelta(days=index)
        rows.append(ResearchExample(
            case_id=f"SYNTHETIC-{asset.upper()}-{index:04d}",
            entity_id=f"synthetic-entity-{asset}-{index:04d}",
            observed_at=observed.isoformat().replace("+00:00", "Z"),
            chain=chain, asset_id=asset, label=label, reviewed=True,
            features={
                "event_count": float(3 + (index * 7) % 30),
                "counterparty_count": float(1 + (index * 3) % 13),
                "temporal_density": float(((index * 11) % 17) / 17 + label * 0.18),
                "concentration": float(((index * 5) % 19) / 19),
            },
        ))
    return rows


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    started = time.perf_counter()
    results = []
    cutoff = (datetime(2026, 7, 1, tzinfo=timezone.utc) + timedelta(days=84)).isoformat().replace("+00:00", "Z")
    features = ("event_count", "counterparty_count", "temporal_density", "concentration")
    for chain, asset in ASSETS:
        result = train_reviewed_baseline(synthetic_examples(chain, asset), cutoff=cutoff,
                                         feature_names=features, review_capacity=10)
        results.append(result)
    report = {
        "status": "synthetic_research_only",
        "generated_at": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
        "synthetic_cases": 120 * len(ASSETS),
        "models_trained": len(results),
        "elapsed_seconds": round(time.perf_counter() - started, 4),
        "results": results,
        "disclaimer": "Synthetic labels and features; no real AML performance or customer decision is implied.",
    }
    args.output.parent.mkdir(mode=0o700, parents=True, exist_ok=True)
    descriptor = os.open(args.output, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
    with os.fdopen(descriptor, "w") as handle:
        json.dump(report, handle, indent=2, sort_keys=True)
        handle.write("\n")
    print(json.dumps({key: report[key] for key in ("status", "synthetic_cases", "models_trained", "elapsed_seconds")}))


if __name__ == "__main__":
    main()
