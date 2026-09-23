"""Private, aggregate evidence ledger for initial chain data sources.

This module never exports transaction or script identifiers. A source probe is
reported as a probe, and a bounded sample is never promoted to chain coverage.
"""

import argparse
import hashlib
import json
import os
import re
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path


ASSETS = (
    ("bitcoin", "BTC"),
    ("ethereum", "ETH"),
    ("ethereum", "USDT-ERC20"),
    ("ethereum", "USDC-ERC20"),
    ("bloch", "BLCH"),
)
UNITS = {
    "BTC": "satoshi",
    "ETH": "wei",
    "USDT-ERC20": "token_base_unit_metadata_unverified",
    "USDC-ERC20": "token_base_unit_metadata_unverified",
    "BLCH": "bloch_satoshi",
}
HEX64 = re.compile(r"[0-9a-fA-F]{64}")
BASE_UNITS = re.compile(r"[0-9]{1,39}")


def freshness(observed_at, as_of):
    if not observed_at:
        return {"observed_at": None, "age_seconds": None, "status": "unknown"}
    observed = datetime.fromisoformat(observed_at.replace("Z", "+00:00"))
    if observed.tzinfo is None:
        raise ValueError("source timestamp has no timezone")
    age = (as_of - observed).total_seconds()
    if age < 0:
        return {"observed_at": observed_at, "age_seconds": None, "status": "future_timestamp_review_required"}
    return {"observed_at": observed_at, "age_seconds": int(age), "status": "measured_not_sla"}


def inspect_bloch_sample(sample_dir):
    sample_dir = Path(sample_dir)
    manifest = json.loads((sample_dir / "bloch-sample-manifest.json").read_text())
    raw = (sample_dir / "bloch-sample.jsonl").read_bytes()
    digest = hashlib.sha256(raw).hexdigest()
    if digest != manifest.get("records_sha256"):
        raise ValueError("Bloch sample digest mismatch")
    if manifest.get("status") != "bounded_private_research_sample":
        raise ValueError("unexpected Bloch sample status")

    created = {}
    spent = []
    transactions = set()
    counts = Counter()
    min_height = max_height = None
    for line in raw.splitlines():
        row = json.loads(line)
        if row.get("source_id") != manifest.get("source_id"):
            raise ValueError("mixed Bloch sample sources")
        kind = row.get("record_type")
        if kind == "created_output_observation":
            if (not HEX64.fullmatch(row.get("tx_id", ""))
                    or type(row.get("event_index")) is not int or row["event_index"] < 0
                    or not HEX64.fullmatch(row.get("script_hash", ""))
                    or not BASE_UNITS.fullmatch(row.get("value_sat", ""))):
                raise ValueError("invalid created output structure")
            key = (row["tx_id"], row["event_index"])
            if key in created:
                raise ValueError("duplicate created outpoint")
            created[key] = row
            transactions.add(row["tx_id"])
            counts["created_outputs"] += 1
        elif kind == "spent_outpoint_observation":
            if (not HEX64.fullmatch(row.get("spending_tx_id", ""))
                    or not HEX64.fullmatch(row.get("prior_tx_id", ""))
                    or type(row.get("prior_vout")) is not int or row["prior_vout"] < 0
                    or not HEX64.fullmatch(row.get("prior_script_hash", ""))
                    or not BASE_UNITS.fullmatch(row.get("value_sat", ""))):
                raise ValueError("invalid spent outpoint structure")
            spent.append(row)
            transactions.add(row["spending_tx_id"])
            counts["spent_outpoint_observations"] += 1
            height = row["height"]
            if type(height) is not int or height < 0 or height > manifest["reported_finalized_height"]:
                raise ValueError("invalid or unfinalized Bloch input observation")
            min_height = height if min_height is None else min(min_height, height)
            max_height = height if max_height is None else max(max_height, height)
        else:
            raise ValueError("unsupported Bloch record type")
        if row.get("sender_ownership_asserted") is not False:
            raise ValueError("Bloch sample asserts sender ownership")

    if len(raw.splitlines()) != manifest.get("record_count"):
        raise ValueError("Bloch sample record count mismatch")
    if any(counts[key] != manifest.get(key) for key in ("created_outputs", "spent_outpoint_observations")):
        raise ValueError("Bloch sample observation count mismatch")
    if len(transactions) > manifest.get("finalized_transactions", -1):
        raise ValueError("Bloch sample has more transaction IDs than reported")

    seen_spends = set()
    resolved = inconsistent = duplicate_spends = 0
    for row in spent:
        key = (row["prior_tx_id"], row["prior_vout"])
        if key in seen_spends:
            duplicate_spends += 1
        seen_spends.add(key)
        prior = created.get(key)
        if prior is not None:
            resolved += 1
            if prior["value_sat"] != row["value_sat"] or prior["script_hash"] != row["prior_script_hash"]:
                inconsistent += 1

    return {
        "source_id": manifest["source_id"],
        "kind": "bounded_private_research_sample",
        "retrieved_at": manifest["retrieved_at"],
        "sample_digest": digest,
        "snapshot_height": manifest["snapshot_height"],
        "snapshot_slot": manifest["snapshot_slot"],
        "reported_finalized_height": manifest["reported_finalized_height"],
        "sampled_input_height_min": min_height,
        "sampled_input_height_max": max_height,
        "pages": manifest["pages"],
        "response_bound_retries": manifest.get("response_bound_retries", 0),
        "page_limits_used": manifest.get("page_limits_used"),
        "finalized_transactions": manifest["finalized_transactions"],
        "transactions_with_observations": len(transactions),
        "created_outputs": counts["created_outputs"],
        "spent_outpoint_observations": counts["spent_outpoint_observations"],
        "within_sample_resolved_outpoints": resolved,
        "within_sample_unresolved_outpoints": len(spent) - resolved,
        "within_sample_resolution_fraction": round(resolved / len(spent), 6) if spent else None,
        "within_sample_inconsistent_outpoints": inconsistent,
        "duplicate_spent_outpoints": duplicate_spends,
        "pagination_exhausted": bool(manifest["source_complete"]),
        "chain_history_complete": False,
        "live_feed": False,
        "quality_gate": "pass" if inconsistent == duplicate_spends == 0 else "review_required",
        "caveats": [
            "bounded_nonrepresentative_sample",
            "within_sample_resolution_is_not_chain_coverage",
            "outpoint_link_does_not_establish_person_or_wallet_ownership",
        ],
    }


def build_ledger(*, bloch_sample_dir=None, chain_health_path=None, as_of=None):
    as_of = as_of or datetime.now(timezone.utc)
    if as_of.tzinfo is None:
        raise ValueError("ledger time must have a timezone")
    health = {}
    health_retrieved_at = None
    if chain_health_path is not None:
        health_document = json.loads(Path(chain_health_path).read_text())
        if health_document.get("kind") != "public_source_health_only":
            raise ValueError("unexpected chain health document")
        health = health_document.get("sources", {})
        health_retrieved_at = health_document.get("retrieved_at")
    bloch = inspect_bloch_sample(bloch_sample_dir) if bloch_sample_dir is not None else None
    entries = []
    for chain, asset in ASSETS:
        if chain == "bloch":
            source = bloch
            status = "bounded_private_sample" if bloch else "unavailable"
        else:
            source = health.get(chain)
            status = "height_probe_only" if isinstance(source, dict) and source.get("status") == "reachable" else "unavailable"
        entry = {
            "chain": chain,
            "asset": asset,
            "status": status,
            "unit": UNITS[asset],
            "amounts_are_exact_integers": True if chain == "bloch" and source else None,
            "live_transactions_ingested": 0,
            "production_coverage_asserted": False,
            "aml_scores_computed": 0,
            "freshness": freshness(source.get("retrieved_at") if chain == "bloch" and source else health_retrieved_at if source else None, as_of),
            "gap_detection": "not_implemented",
            "reorg_replay": "not_implemented",
            "independent_source_reconciliation": "not_implemented",
        }
        if chain == "bloch" and source:
            entry["private_sample"] = source
            entry["finality_evidence"] = "indexer_reported_finalized_height_not_independently_verified"
            entry["lineage"] = {"source_id": source["source_id"], "sample_sha256": source["sample_digest"]}
            entry["completeness"] = {
                "bounded_sample_records_verified": True,
                "sampled_transactions": source["finalized_transactions"],
                "chain_transaction_total": None,
                "chain_transaction_coverage_fraction": None,
                "token_or_asset_specific_event_coverage": None,
            }
        elif status == "height_probe_only":
            entry["probe"] = {
                key: source[key]
                for key in ("reported_finalized_height", "reported_finalized_hash", "reported_tip_height", "finality")
                if key in source
            }
            entry["probe"]["transactions_ingested"] = 0
            entry["finality_evidence"] = "source_reported_finalized_block_only" if chain == "ethereum" else "tip_height_only_no_confirmation_policy"
            entry["lineage"] = {"source_id": "public_source_health_probe", "source_url": source.get("source_url")}
            entry["completeness"] = {
                "sampled_transactions": 0,
                "chain_transaction_total": None,
                "chain_transaction_coverage_fraction": None,
                "token_or_asset_specific_event_coverage": None,
            }
        else:
            entry["finality_evidence"] = "none"
            entry["lineage"] = None
            entry["completeness"] = {
                "sampled_transactions": 0,
                "chain_transaction_total": None,
                "chain_transaction_coverage_fraction": None,
                "token_or_asset_specific_event_coverage": None,
            }
        if asset in ("USDT-ERC20", "USDC-ERC20"):
            entry["token_log_ingestion"] = "none"
            entry["contract_metadata_verified"] = False
        entries.append(entry)
    return {
        "schema_version": 1,
        "kind": "initial_asset_data_evidence_ledger",
        "generated_at": as_of.isoformat().replace("+00:00", "Z"),
        "assets": entries,
        "production_ready": False,
        "privacy": "aggregate_only_no_transaction_or_wallet_identifiers",
    }


def write_private(ledger, destination):
    destination = Path(destination)
    destination.parent.mkdir(parents=True, mode=0o700, exist_ok=True)
    os.chmod(destination.parent, 0o700)
    temporary = destination.with_suffix(destination.suffix + ".tmp")
    descriptor = os.open(temporary, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
    with os.fdopen(descriptor, "w") as handle:
        json.dump(ledger, handle, sort_keys=True, indent=2)
        handle.write("\n")
        handle.flush()
        os.fsync(handle.fileno())
    os.replace(temporary, destination)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--bloch-sample-dir", type=Path)
    parser.add_argument("--chain-health", type=Path)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    ledger = build_ledger(bloch_sample_dir=args.bloch_sample_dir, chain_health_path=args.chain_health)
    write_private(ledger, args.output)
    print(json.dumps({"kind": ledger["kind"], "assets": {row["asset"]: row["status"] for row in ledger["assets"]}, "production_ready": False}))


if __name__ == "__main__":
    main()
