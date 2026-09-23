"""Aggregate private Bloch sample quality without emitting wallet identifiers."""

import argparse
import hashlib
import json
import os
from collections import Counter
from pathlib import Path


def percentile(values, percent):
    if not values:
        return None
    sorted_values = sorted(values)
    return sorted_values[min(len(values) - 1, int((len(values) - 1) * percent / 100))]


def analyze(records_path, manifest_path):
    records_path, manifest_path = Path(records_path), Path(manifest_path)
    manifest = json.loads(manifest_path.read_text())
    raw = records_path.read_bytes()
    if hashlib.sha256(raw).hexdigest() != manifest["records_sha256"]:
        raise ValueError("sample digest does not match manifest")
    created, spent = {}, []
    inputs_by_tx, outputs_by_tx = Counter(), Counter()
    created_scripts, spent_scripts = set(), set()
    for line in raw.splitlines():
        row = json.loads(line)
        if row["record_type"] == "created_output_observation":
            key = (row["tx_id"], row["event_index"])
            if key in created:
                raise ValueError("duplicate output")
            created[key] = row
            outputs_by_tx[row["tx_id"]] += 1
            created_scripts.add(row["script_hash"])
        elif row["record_type"] == "spent_outpoint_observation":
            spent.append(row)
            inputs_by_tx[row["spending_tx_id"]] += 1
            spent_scripts.add(row["prior_script_hash"])
        else:
            raise ValueError("unsupported sample record")
    if len(created) != manifest["created_outputs"] or len(spent) != manifest["spent_outpoint_observations"]:
        raise ValueError("sample counts do not match manifest")
    linked = sum((row["prior_tx_id"], row["prior_vout"]) in created for row in spent)
    tx_ids = set(inputs_by_tx) | set(outputs_by_tx)
    input_counts = [inputs_by_tx[tx_id] for tx_id in tx_ids]
    output_counts = [outputs_by_tx[tx_id] for tx_id in tx_ids]
    return {
        "status": "bounded_private_aggregate_analysis",
        "source_id": manifest["source_id"],
        "sample_digest": manifest["records_sha256"],
        "source_complete": manifest["source_complete"],
        "sampled_finalized_transactions": manifest["finalized_transactions"],
        "transaction_ids_with_records": len(tx_ids),
        "created_outputs": len(created),
        "spent_outpoint_observations": len(spent),
        "within_sample_spent_outpoints_resolved": linked,
        "within_sample_resolution_fraction": round(linked / len(spent), 6) if spent else None,
        "unique_created_script_hashes": len(created_scripts),
        "unique_spent_script_hashes": len(spent_scripts),
        "created_value_sat": str(sum(int(row["value_sat"]) for row in created.values())),
        "input_count_per_tx": {"p50": percentile(input_counts, 50), "p90": percentile(input_counts, 90), "p99": percentile(input_counts, 99), "max": max(input_counts) if input_counts else None},
        "output_count_per_tx": {"p50": percentile(output_counts, 50), "p90": percentile(output_counts, 90), "p99": percentile(output_counts, 99), "max": max(output_counts) if output_counts else None},
        "caveats": ["bounded_nonrepresentative_sample", "script_hash_is_not_person_identity", "within_sample_resolution_is_not_chain_coverage", "no_aml_score_or_model"],
    }


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--sample-dir", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    report = analyze(args.sample_dir / "bloch-sample.jsonl", args.sample_dir / "bloch-sample-manifest.json")
    args.output.parent.mkdir(mode=0o700, parents=True, exist_ok=True)
    descriptor = os.open(args.output, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
    with os.fdopen(descriptor, "w") as handle:
        json.dump(report, handle, indent=2, sort_keys=True)
        handle.write("\n")
    print(json.dumps({key: report[key] for key in ("status", "sampled_finalized_transactions", "created_outputs", "spent_outpoint_observations", "within_sample_spent_outpoints_resolved", "unique_created_script_hashes", "unique_spent_script_hashes")}))


if __name__ == "__main__":
    main()
