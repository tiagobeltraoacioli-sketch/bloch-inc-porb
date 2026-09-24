"""Private aggregate transaction graph for one bounded Bloch eUTXO sample."""

import argparse
import hashlib
import json
from collections import Counter
from pathlib import Path

from .bloch_sample_analysis import percentile
from .data_quality import inspect_bloch_sample, write_private


MAX_SAMPLE_BYTES = 64_000_000


def _distribution(values):
    return {"p50": percentile(values, 50), "p90": percentile(values, 90),
            "p99": percentile(values, 99), "max": max(values) if values else None}


def build_report(sample_dir):
    sample_dir = Path(sample_dir)
    records_path = sample_dir / "bloch-sample.jsonl"
    if records_path.stat().st_size > MAX_SAMPLE_BYTES:
        raise ValueError("Bloch graph sample exceeds byte bound")
    evidence = inspect_bloch_sample(sample_dir)
    if evidence["quality_gate"] != "pass":
        raise ValueError("Bloch graph sample quality requires review")
    raw = records_path.read_bytes()
    if hashlib.sha256(raw).hexdigest() != evidence["sample_digest"]:
        raise ValueError("Bloch graph sample changed after validation")
    created = {}
    spends = []
    tx_inputs, tx_outputs = Counter(), Counter()
    created_scripts = Counter()
    output_values = []
    slots = set()
    for line in raw.splitlines():
        row = json.loads(line)
        slot = row.get("slot")
        if type(slot) is not int or slot < 0 or slot > evidence["snapshot_slot"]:
            raise ValueError("invalid Bloch observation slot")
        slots.add(slot)
        if row["record_type"] == "created_output_observation":
            if (row.get("chain"), row.get("network"), row.get("asset_id"), row.get("finality")) != (
                    "bloch", "genesis4-mainnet", "blch", "finalized"):
                raise ValueError("invalid Bloch output scope or finality")
            key = (row["tx_id"], row["event_index"])
            created[key] = row
            tx_outputs[row["tx_id"]] += 1
            created_scripts[row["script_hash"]] += 1
            output_values.append(int(row["value_sat"]))
        else:
            spends.append(row)
            tx_inputs[row["spending_tx_id"]] += 1
    tx_ids = set(tx_inputs) | set(tx_outputs)
    if len(tx_ids) != evidence["transactions_with_observations"]:
        raise ValueError("Bloch graph transaction count differs from verified sample")
    parents = {txid: txid for txid in tx_ids}

    def root(txid):
        while parents[txid] != txid:
            parents[txid] = parents[parents[txid]]
            txid = parents[txid]
        return txid

    links = 0
    pairs = set()
    linked_transactions = set()
    for row in spends:
        prior = created.get((row["prior_tx_id"], row["prior_vout"]))
        if prior is None:
            continue
        if (row["value_sat"] != prior["value_sat"]
                or row["prior_script_hash"] != prior["script_hash"]
                or row["slot"] < prior["slot"]
                or row["spending_tx_id"] == prior["tx_id"]):
            raise ValueError("conflicting Bloch within-sample outpoint link")
        links += 1
        pair = (prior["tx_id"], row["spending_tx_id"])
        pairs.add(pair)
        linked_transactions.update(pair)
        parents[root(pair[1])] = root(pair[0])
    if links != evidence["within_sample_resolved_outpoints"]:
        raise ValueError("Bloch graph link count differs from verified sample")
    component_sizes = Counter(root(txid) for txid in tx_ids)
    ordered_sizes = list(component_sizes.values())
    values_sorted = sorted(output_values)
    return {
        "kind": "bounded_private_bloch_transaction_graph_summary",
        "classification": "within_sample_outpoint_graph_not_wallet_or_chain_coverage",
        "source_id": evidence["source_id"],
        "sample_digest": evidence["sample_digest"],
        "source_reported_finalized_height": evidence["reported_finalized_height"],
        "sampled_finalized_transactions": evidence["finalized_transactions"],
        "transactions_with_observations": len(tx_ids),
        "created_outputs": len(created),
        "spent_outpoint_observations": len(spends),
        "within_sample_consistent_outpoint_links": links,
        "spend_references_without_creation_in_sample": len(spends) - links,
        "distinct_linked_transaction_pairs": len(pairs),
        "linked_transactions": len(linked_transactions),
        "weak_transaction_components": len(component_sizes),
        "largest_component_transactions": max(ordered_sizes) if ordered_sizes else 0,
        "isolated_observed_transactions": sum(size == 1 for size in ordered_sizes),
        "observed_slot_count_not_coverage": len(slots),
        "input_references_per_observed_transaction": _distribution([tx_inputs[txid] for txid in tx_ids]),
        "created_outputs_per_observed_transaction": _distribution([tx_outputs[txid] for txid in tx_ids]),
        "created_output_value_sat": {
            "total": str(sum(output_values)), "zero_value_count": output_values.count(0),
            "p50": str(percentile(values_sorted, 50)) if values_sorted else None,
            "p90": str(percentile(values_sorted, 90)) if values_sorted else None,
            "p99": str(percentile(values_sorted, 99)) if values_sorted else None,
            "max": str(values_sorted[-1]) if values_sorted else None,
        },
        "created_script_reuse": {
            "distinct_script_hashes": len(created_scripts),
            "scripts_with_multiple_outputs": sum(count > 1 for count in created_scripts.values()),
            "max_outputs_for_one_script": max(created_scripts.values()) if created_scripts else 0,
        },
        "source_finality_independently_verified": False,
        "chain_history_complete": False,
        "wallet_ownership_inferred": False,
        "value_continuity_through_transactions_proven": False,
        "aml_scores_computed": 0,
        "public_release": False,
    }


def main():
    parser = argparse.ArgumentParser(description="Private bounded Bloch transaction graph summary")
    parser.add_argument("--sample-dir", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    report = build_report(args.sample_dir)
    write_private(report, args.output)
    print(json.dumps({key: report[key] for key in (
        "kind", "sampled_finalized_transactions", "created_outputs",
        "spent_outpoint_observations", "within_sample_consistent_outpoint_links",
        "weak_transaction_components", "largest_component_transactions")}))


if __name__ == "__main__":
    main()
