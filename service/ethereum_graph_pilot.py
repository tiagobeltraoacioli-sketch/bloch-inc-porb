"""Private aggregate graph summary for one bounded Ethereum pilot."""

import argparse
import json
from collections import Counter, defaultdict
from pathlib import Path

from .data_quality import inspect_ethereum_pilot, write_private
from .ethereum import TOKEN_CONTRACTS
from .graph_analytics import GraphAnalytics


def build_report(sample_dir):
    evidence = inspect_ethereum_pilot(sample_dir)
    graph = GraphAnalytics.from_ethereum_pilot(sample_dir)
    symbols = {"eth": "eth", **{
        "erc20:" + contract: symbol for contract, symbol in TOKEN_CONTRACTS.items()
    }}
    counts = Counter(symbols[item.asset_id] for item in graph.events)
    expected = evidence["movement_counts"]
    if any(counts[symbol] != expected[symbol] for symbol in ("eth", "usdt", "usdc")):
        raise ValueError("Ethereum graph event counts differ from verified pilot")
    references = defaultdict(set)
    for item in graph.events:
        symbol = symbols[item.asset_id]
        references[symbol].add(item.destination)
        if item.sender_attribution == "direct":
            references[symbol].add(item.sender)
    return {
        "kind": "bounded_private_ethereum_graph_pilot_summary",
        "classification": "sample_graph_not_chain_coverage_or_aml_model",
        "source_id": evidence["source_id"],
        "source_reported_block_time": evidence["source_reported_block_time"],
        "sample_digest": evidence["sample_digest"],
        "sampled_transactions": evidence["sampled_transactions"],
        "graph_events_by_asset": {symbol: counts[symbol] for symbol in ("eth", "usdt", "usdc")},
        "distinct_protocol_references_by_asset": {
            symbol: len(references[symbol]) for symbol in ("eth", "usdt", "usdc")
        },
        "chain_history_complete": False,
        "independent_finality_validated": False,
        "wallet_ownership_inferred": False,
        "aml_scores_computed": 0,
        "public_release": False,
    }


def main():
    parser = argparse.ArgumentParser(description="Private bounded Ethereum graph summary")
    parser.add_argument("--sample-dir", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    report = build_report(args.sample_dir)
    write_private(report, args.output)
    print(json.dumps({"kind": report["kind"], "sampled_transactions": report["sampled_transactions"],
                      "graph_events_by_asset": report["graph_events_by_asset"],
                      "production_ready": False}))


if __name__ == "__main__":
    main()
