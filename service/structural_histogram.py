"""Export privacy-reduced transaction-shape counts for off-host ML research."""

import argparse
import hashlib
import json
import math
import os
from collections import Counter
from pathlib import Path


def build_histogram(records_path, manifest_path, min_cell_count=5):
    if min_cell_count < 5:
        raise ValueError("small cells must be suppressed")
    manifest = json.loads(Path(manifest_path).read_text())
    raw = Path(records_path).read_bytes()
    if hashlib.sha256(raw).hexdigest() != manifest["records_sha256"]:
        raise ValueError("sample digest mismatch")
    input_count, output_count, created_value = Counter(), Counter(), Counter()
    for line in raw.splitlines():
        row = json.loads(line)
        if row["record_type"] == "spent_outpoint_observation":
            input_count[row["spending_tx_id"]] += 1
        elif row["record_type"] == "created_output_observation":
            output_count[row["tx_id"]] += 1
            created_value[row["tx_id"]] += int(row["value_sat"])
        else:
            raise ValueError("unsupported record")
    histogram = Counter()
    for tx_id in set(input_count) | set(output_count):
        shape = (int(math.log2(input_count[tx_id] + 1)),
                 int(math.log2(output_count[tx_id] + 1)),
                 int(math.log10(max(1, created_value[tx_id]))))
        histogram[shape] += 1
    released = [{"input_log2_bin": shape[0], "output_log2_bin": shape[1],
                 "created_value_log10_bin": shape[2], "transaction_count": count}
                for shape, count in sorted(histogram.items()) if count >= min_cell_count]
    included = sum(row["transaction_count"] for row in released)
    observed = sum(histogram.values())
    if observed > manifest["finalized_transactions"]:
        raise ValueError("more transaction shapes than finalized transactions")
    return {
        "status": "privacy_reduced_structural_histogram",
        "source_sample_sha256": manifest["records_sha256"],
        "source_complete": manifest["source_complete"],
        "sampled_transactions": manifest["finalized_transactions"],
        "included_transactions": included,
        "suppressed_transactions": observed - included,
        "unrepresented_transactions": manifest["finalized_transactions"] - observed,
        "min_cell_count": min_cell_count,
        "cells": released,
        "identifiers_included": False,
        "caveat": "No wallet/transaction IDs or individual values; small cells suppressed. This is not proof of anonymity or AML behavior.",
    }


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--sample-dir", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    report = build_histogram(args.sample_dir / "bloch-sample.jsonl", args.sample_dir / "bloch-sample-manifest.json")
    args.output.parent.mkdir(mode=0o700, parents=True, exist_ok=True)
    descriptor = os.open(args.output, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
    with os.fdopen(descriptor, "w") as handle:
        json.dump(report, handle, indent=2, sort_keys=True)
        handle.write("\n")
    print(json.dumps({key: report[key] for key in ("status", "sampled_transactions", "included_transactions", "suppressed_transactions", "unrepresented_transactions", "identifiers_included")} | {"cells": len(report["cells"])}))


if __name__ == "__main__":
    main()
