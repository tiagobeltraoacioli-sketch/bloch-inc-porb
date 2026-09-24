"""Private aggregate transaction graph from one bounded Bitcoin block pilot."""

import argparse
import hashlib
import json
from collections import Counter
from pathlib import Path

from .bitcoin_pilot import write_private
from .bloch_sample_analysis import percentile
from .data_quality import inspect_bitcoin_pilot


MAX_SAMPLE_BYTES = 8_000_000


def _distribution(values):
    return {"p50": percentile(values, 50), "p90": percentile(values, 90),
            "p99": percentile(values, 99), "max": max(values) if values else None}


def build_report(pilot_path):
    pilot_path = Path(pilot_path)
    with pilot_path.open("rb") as handle:
        raw = handle.read(MAX_SAMPLE_BYTES + 1)
    if len(raw) > MAX_SAMPLE_BYTES:
        raise ValueError("Bitcoin graph pilot exceeds byte bound")
    evidence = inspect_bitcoin_pilot(pilot_path)
    if hashlib.sha256(raw).hexdigest() != evidence["sample_digest"]:
        raise ValueError("Bitcoin graph pilot changed after validation")
    sample = json.loads(raw)
    if sample["schema_version"] not in (2, 3) or not evidence["merkle_inclusion_locally_verified"]:
        raise ValueError("Bitcoin graph requires verified schema-v2 or v3 pilot")

    created = {}
    spends = []
    input_counts = []
    output_counts = []
    output_values = []
    scripts = Counter()
    transactions = sample["transactions"]
    positions = {tx["txid"]: position for position, tx in enumerate(transactions)}
    for tx in transactions:
        input_counts.append(sum(item["kind"] == "spent_outpoint_reference" for item in tx["inputs"]))
        output_counts.append(len(tx["outputs"]))
        for output in tx["outputs"]:
            key = (tx["txid"], output["vout"])
            created[key] = output
            output_values.append(int(output["value_sat"]))
            scripts[output["scriptpubkey_hex"]] += 1
        for item in tx["inputs"]:
            if item["kind"] == "spent_outpoint_reference":
                prior = item["spent_outpoint"]
                spends.append((tx["txid"], prior["txid"], prior["vout"]))

    parents = {txid: txid for txid in positions}

    def root(txid):
        while parents[txid] != txid:
            parents[txid] = parents[parents[txid]]
            txid = parents[txid]
        return txid

    links = 0
    linked_transactions = set()
    seen_spends = set()
    for spending_txid, prior_txid, prior_vout in spends:
        key = (prior_txid, prior_vout)
        if key in seen_spends:
            raise ValueError("duplicate Bitcoin spent outpoint in sample")
        seen_spends.add(key)
        if key not in created:
            continue
        if positions[prior_txid] >= positions[spending_txid]:
            raise ValueError("Bitcoin within-block outpoint order conflicts")
        links += 1
        linked_transactions.update((prior_txid, spending_txid))
        parents[root(spending_txid)] = root(prior_txid)
    sizes = list(Counter(root(txid) for txid in positions).values())
    return {
        "kind": "bounded_private_bitcoin_transaction_graph_summary",
        "classification": "within_sample_outpoint_graph_not_wallet_or_chain_coverage",
        "source_id": evidence["source_id"],
        "sample_digest": evidence["sample_digest"],
        "block_height": evidence["block_height"],
        "source_reported_confirmations_at_collection": evidence["confirmations_source_reported"],
        "sampled_transactions": len(transactions),
        "sampled_outputs": len(created),
        "sampled_input_outpoint_references": len(spends),
        "within_sample_outpoint_links": links,
        "spend_references_without_creation_in_sample": len(spends) - links,
        "linked_transactions": len(linked_transactions),
        "weak_transaction_components": len(sizes),
        "largest_component_transactions": max(sizes) if sizes else 0,
        "isolated_observed_transactions": sum(size == 1 for size in sizes),
        "input_references_per_sampled_transaction": _distribution(input_counts),
        "outputs_per_sampled_transaction": _distribution(output_counts),
        "created_output_value_sat": {
            "total": str(sum(output_values)),
            "zero_value_count": output_values.count(0),
            "p50": str(percentile(output_values, 50)) if output_values else None,
            "p90": str(percentile(output_values, 90)) if output_values else None,
            "p99": str(percentile(output_values, 99)) if output_values else None,
            "max": str(max(output_values)) if output_values else None,
        },
        "created_script_reuse": {
            "distinct_scripts": len(scripts),
            "scripts_with_multiple_outputs": sum(count > 1 for count in scripts.values()),
            "max_outputs_for_one_script": max(scripts.values()) if scripts else 0,
        },
        "header_hash_locally_verified": True,
        "sampled_transaction_merkle_inclusion_locally_verified": True,
        "transaction_bodies_locally_verified_against_txids": evidence["transaction_bodies_locally_verified_against_txids"],
        "consensus_or_best_chain_independently_verified": False,
        "chain_history_complete": False,
        "wallet_ownership_inferred": False,
        "value_continuity_through_transactions_proven": False,
        "aml_scores_computed": 0,
        "public_release": False,
    }


def main():
    parser = argparse.ArgumentParser(description="Private bounded Bitcoin transaction graph summary")
    parser.add_argument("--pilot", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    report = build_report(args.pilot)
    if args.output.resolve() == args.pilot.resolve():
        raise ValueError("report path must differ from pilot path")
    write_private(report, args.output)
    print(json.dumps({key: report[key] for key in (
        "kind", "sampled_transactions", "sampled_outputs", "sampled_input_outpoint_references",
        "within_sample_outpoint_links", "weak_transaction_components")}))


if __name__ == "__main__":
    main()
