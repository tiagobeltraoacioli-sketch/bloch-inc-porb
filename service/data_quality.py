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

from .ethereum import ADDRESS, TOKEN_CONTRACTS
from .bitcoin_pilot import SOURCE_ID as BITCOIN_PRIMARY_SOURCE_ID, verify_header, verify_merkle_proof
from .normalization import Movement


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
ETH_HEX64 = re.compile(r"0x[0-9a-fA-F]{64}")
BITCOIN_SECONDARY_SOURCE_ID = "mempool-space-bitcoin-mainnet"
BITCOIN_RECONCILIATION_MAX_AGE_SECONDS = 86_400
ETHEREUM_RECONCILIATION_MAX_AGE_SECONDS = 86_400


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


def inspect_ethereum_pilot(sample_dir):
    """Verify a private finalized-block pilot and return aggregate evidence only."""
    sample_dir = Path(sample_dir)
    manifest = json.loads((sample_dir / "ethereum-pilot-manifest.json").read_text())
    raw = (sample_dir / "ethereum-pilot.jsonl").read_bytes()
    digest = hashlib.sha256(raw).hexdigest()
    if digest != manifest.get("records_sha256"):
        raise ValueError("Ethereum pilot digest mismatch")
    if (manifest.get("status") != "bounded_private_ethereum_research_sample"
            or manifest.get("source_id") != "ethereum-mainnet-rpc" or manifest.get("chain_id") != 1
            or not ETH_HEX64.fullmatch(manifest.get("source_reported_finalized_block_hash", ""))
            or type(manifest.get("source_reported_finalized_block_number")) is not int):
        raise ValueError("invalid Ethereum pilot provenance")
    finalized_head = manifest.get("finalized_head_number_at_collection")
    if finalized_head is not None and (type(finalized_head) is not int
                                       or finalized_head < manifest["source_reported_finalized_block_number"]):
        raise ValueError("invalid Ethereum source-reported finalized head")
    records = [json.loads(line) for line in raw.splitlines()]
    if len(records) != manifest.get("record_count"):
        raise ValueError("Ethereum pilot record count mismatch")
    transactions, events = {}, set()
    movement_counts = {"eth": 0, "usdt": 0, "usdc": 0}
    for row in records:
        if row.get("source_id") != manifest["source_id"]:
            raise ValueError("Ethereum pilot source mismatch")
        if row.get("record_type") == "sampled_transaction":
            txid = row.get("tx_id", "")
            if (not ETH_HEX64.fullmatch(txid) or txid in transactions
                    or row.get("block_hash") != manifest["source_reported_finalized_block_hash"]
                    or row.get("block_number") != manifest["source_reported_finalized_block_number"]
                    or type(row.get("transaction_index")) is not int or row["transaction_index"] < 0
                    or row.get("receipt_status") not in ("0x0", "0x1")):
                raise ValueError("invalid Ethereum sampled transaction")
            transactions[txid] = row["receipt_status"]
        elif row.get("record_type") == "normalized_movement":
            fields = {name: row.get(name) for name in Movement.__dataclass_fields__}
            movement = Movement(**fields)
            token = movement.asset_id[6:] if movement.asset_id.startswith("erc20:") else None
            if (movement.chain != "ethereum" or movement.network != "mainnet"
                    or movement.finality != "finalized" or movement.sender_attribution != "direct"
                    or movement.block_ref != manifest["source_reported_finalized_block_hash"]
                    or movement.height_or_slot != manifest["source_reported_finalized_block_number"]
                    or row.get("event_key") != movement.key or movement.key in events
                    or not ADDRESS.fullmatch(movement.destination)
                    or not ADDRESS.fullmatch(movement.sender or "")
                    or (movement.asset_id != "eth" and token not in TOKEN_CONTRACTS)):
                raise ValueError("invalid Ethereum normalized movement")
            events.add(movement.key)
            movement_counts["eth" if movement.asset_id == "eth" else TOKEN_CONTRACTS[token]] += 1
        else:
            raise ValueError("unsupported Ethereum pilot record")
    if (len(transactions) != manifest.get("sampled_transactions")
            or len(events) != manifest.get("normalized_movements")
            or movement_counts != manifest.get("movement_counts")
            or type(manifest.get("block_transaction_count")) is not int
            or not 0 <= len(transactions) <= manifest["block_transaction_count"]):
        raise ValueError("Ethereum pilot count mismatch")
    if any(row["tx_id"] not in transactions or transactions[row["tx_id"]] != "0x1"
           for row in records if row["record_type"] == "normalized_movement"):
        raise ValueError("Ethereum movement lacks successful sampled receipt")
    return {
        "kind": "bounded_private_ethereum_research_sample",
        "retrieved_at": manifest["retrieved_at"],
        "source_id": manifest["source_id"],
        "source_host": manifest.get("source_host"),
        "sample_digest": digest,
        "source_reported_finalized_block_number": manifest["source_reported_finalized_block_number"],
        "block_transaction_count": manifest["block_transaction_count"],
        "sampled_transactions": len(transactions),
        "normalized_movements": len(events),
        "movement_counts": movement_counts,
        "sample_selection": manifest.get("sample_selection"),
        "chain_history_complete": False,
        "independent_finality_reconciled": False,
        "quality_gate": "pass",
        "caveat": "first transactions in one source-reported finalized block; not chain or asset coverage",
    }


def inspect_bitcoin_pilot(pilot_path):
    """Verify a bounded Bitcoin block artifact and return no transaction IDs."""
    raw = Path(pilot_path).read_bytes()
    sample = json.loads(raw)
    schema_version = sample.get("schema_version")
    if (sample.get("kind") != "bounded_private_bitcoin_block_pilot"
            or schema_version not in (1, 2) or type(schema_version) is not int
            or sample.get("chain") != "bitcoin" or sample.get("network") != "mainnet"
            or sample.get("source_id") != BITCOIN_PRIMARY_SOURCE_ID
            or not HEX64.fullmatch(sample.get("block_hash", ""))
            or type(sample.get("block_height")) is not int or sample["block_height"] < 0
            or type(sample.get("confirmations_source_reported")) is not int
            or sample["confirmations_source_reported"] < 1
            or sample.get("source_reported_best_chain_checked_twice") is not True
            or sample.get("merkle_inclusion_independently_verified") is not False
            or sample.get("independent_node_reconciliation") is not False
            or sample.get("full_history_coverage") is not False
            or sample.get("sender_ownership_inferred") is not False
            or sample.get("aml_scores_computed") != 0):
        raise ValueError("invalid Bitcoin pilot provenance")
    if schema_version == 2:
        if (sample.get("header_hash_locally_verified") is not True
                or sample.get("merkle_inclusion_locally_verified") is not True
                or not HEX64.fullmatch(sample.get("block_merkle_root_source_reported", ""))):
            raise ValueError("invalid Bitcoin pilot proof provenance")
        verify_header(sample.get("block_header_hex"), sample["block_hash"],
                      sample["block_merkle_root_source_reported"])
    elif sample.get("merkle_inclusion_locally_verified") is True:
        raise ValueError("legacy Bitcoin pilot cannot assert verified inclusion")
    transactions = sample.get("transactions")
    if (not isinstance(transactions, list) or not 1 <= len(transactions) <= 5
            or len(transactions) != sample.get("sampled_transactions")
            or type(sample.get("block_tx_count_source_reported")) is not int
            or len(transactions) > sample["block_tx_count_source_reported"]):
        raise ValueError("invalid Bitcoin pilot transaction count")
    seen = set()
    outputs = references = 0
    for index, tx in enumerate(transactions):
        txid = tx.get("txid", "")
        if (not HEX64.fullmatch(txid) or txid in seen
                or tx.get("input_ownership_inferred") is not False
                or tx.get("single_sender_inferred") is not False
                or not isinstance(tx.get("inputs"), list)
                or not isinstance(tx.get("outputs"), list)):
            raise ValueError("invalid Bitcoin pilot transaction")
        seen.add(txid)
        if schema_version == 2:
            if tx.get("merkle_position") != index or type(tx.get("merkle_position")) is not int:
                raise ValueError("Bitcoin pilot Merkle position mismatch")
            verify_merkle_proof(txid, index, sample["block_height"],
                                {"block_height": sample["block_height"], "pos": index,
                                 "merkle": tx.get("merkle_branch")},
                                sample["block_merkle_root_source_reported"])
        coinbase = 0
        for entry in tx["inputs"]:
            if entry.get("kind") == "coinbase_input" and entry.get("spent_outpoint") is None:
                coinbase += 1
            elif entry.get("kind") == "spent_outpoint_reference":
                prior = entry.get("spent_outpoint")
                if (not isinstance(prior, dict) or not HEX64.fullmatch(prior.get("txid", ""))
                        or type(prior.get("vout")) is not int or prior["vout"] < 0):
                    raise ValueError("invalid Bitcoin spent outpoint")
                references += 1
            else:
                raise ValueError("invalid Bitcoin input observation")
        if (index == 0 and (coinbase != 1 or len(tx["inputs"]) != 1)) or (index > 0 and coinbase):
            raise ValueError("invalid Bitcoin coinbase position")
        for vout, output in enumerate(tx["outputs"]):
            sat = output.get("value_sat", "")
            script = output.get("scriptpubkey_hex", "")
            if (output.get("txid") != txid or output.get("vout") != vout
                    or not BASE_UNITS.fullmatch(sat) or int(sat) > 2_100_000_000_000_000
                    or not isinstance(script, str) or len(script) % 2
                    or len(script) > 10_000 or re.fullmatch(r"[0-9a-fA-F]*", script) is None
                    or output.get("unspent_status") != "unknown_not_queried"):
                raise ValueError("invalid Bitcoin output observation")
            outputs += 1
        if tx.get("output_count") != len(tx["outputs"]):
            raise ValueError("Bitcoin output count mismatch")
    if outputs != sample.get("sampled_outputs") or references != sample.get("sampled_spent_outpoint_references"):
        raise ValueError("Bitcoin pilot observation count mismatch")
    return {
        "kind": sample["kind"], "retrieved_at": sample["retrieved_at"],
        "source_id": sample["source_id"], "sample_digest": hashlib.sha256(raw).hexdigest(),
        "block_height": sample["block_height"],
        "confirmations_source_reported": sample["confirmations_source_reported"],
        "sampled_transactions": len(transactions), "sampled_outputs": outputs,
        "sampled_spent_outpoint_references": references,
        "header_hash_locally_verified": schema_version == 2,
        "merkle_inclusion_locally_verified": schema_version == 2,
        "chain_history_complete": False, "independent_node_reconciliation": False,
        "quality_gate": "pass",
        "caveat": "one source-reported best-chain block; probabilistic confirmations, no history or ownership claim",
    }


def inspect_bitcoin_reconciliation(report_path, bitcoin_sample, *, as_of,
                                   max_age_seconds=BITCOIN_RECONCILIATION_MAX_AGE_SECONDS):
    """Bind a second-public-operator report to the exact verified private pilot."""
    report_raw = Path(report_path).read_bytes()
    report = json.loads(report_raw)
    expected_fields = {
        "schema_version", "kind", "retrieved_at", "primary_source_id", "secondary_source_id",
        "pilot_artifact_sha256", "block_height", "sampled_transactions_compared",
        "secondary_confirmations_at_completion", "block_hash_and_header_agree",
        "sampled_positions_and_merkle_proofs_agree", "best_chain_checked_twice",
        "consensus_independently_validated", "full_history_coverage", "aml_scores_computed", "caveat",
    }


    if not isinstance(report, dict) or set(report) != expected_fields:
        raise ValueError("invalid Bitcoin reconciliation report fields")
    if (type(report["schema_version"]) is not int or report["schema_version"] != 1
            or report["kind"] != "bounded_bitcoin_second_source_reconciliation"
            or report["primary_source_id"] != BITCOIN_PRIMARY_SOURCE_ID
            or report["secondary_source_id"] != BITCOIN_SECONDARY_SOURCE_ID
            or report["primary_source_id"] == report["secondary_source_id"]
            or report["pilot_artifact_sha256"] != bitcoin_sample["sample_digest"]
            or type(report["block_height"]) is not int
            or report["block_height"] != bitcoin_sample["block_height"]
            or type(report["sampled_transactions_compared"]) is not int
            or report["sampled_transactions_compared"] != bitcoin_sample["sampled_transactions"]
            or type(report["secondary_confirmations_at_completion"]) is not int
            or report["secondary_confirmations_at_completion"] < bitcoin_sample["confirmations_source_reported"]
            or report["block_hash_and_header_agree"] is not True
            or report["sampled_positions_and_merkle_proofs_agree"] is not True
            or report["best_chain_checked_twice"] is not True
            or report["consensus_independently_validated"] is not False
            or report["full_history_coverage"] is not False
            or type(report["aml_scores_computed"]) is not int or report["aml_scores_computed"] != 0
            or report["caveat"] != "two public operators agree on a bounded sample; no local full-node consensus validation"
            or not bitcoin_sample["header_hash_locally_verified"]
            or not bitcoin_sample["merkle_inclusion_locally_verified"]):
        raise ValueError("Bitcoin reconciliation provenance mismatch")
    if type(max_age_seconds) is not int or max_age_seconds < 0:
        raise ValueError("invalid Bitcoin reconciliation maximum age")
    try:
        observed = datetime.fromisoformat(report["retrieved_at"].replace("Z", "+00:00"))
        pilot_observed = datetime.fromisoformat(bitcoin_sample["retrieved_at"].replace("Z", "+00:00"))
    except (AttributeError, TypeError, ValueError) as error:
        raise ValueError("invalid Bitcoin reconciliation timestamp") from error
    if observed.tzinfo is None or pilot_observed.tzinfo is None:
        raise ValueError("Bitcoin reconciliation timestamp has no timezone")
    age = (as_of - observed).total_seconds()
    if observed < pilot_observed or age < 0 or age > max_age_seconds:
        raise ValueError("stale or future Bitcoin reconciliation")
    return {
        "kind": report["kind"],
        "retrieved_at": report["retrieved_at"],
        "age_seconds": int(age),
        "report_sha256": hashlib.sha256(report_raw).hexdigest(),
        "pilot_artifact_sha256": bitcoin_sample["sample_digest"],
        "primary_source_id": report["primary_source_id"],
        "secondary_source_id": report["secondary_source_id"],
        "sampled_transactions_compared": report["sampled_transactions_compared"],
        "secondary_confirmations_at_completion": report["secondary_confirmations_at_completion"],
        "block_hash_and_header_agree": True,
        "sampled_positions_and_merkle_proofs_agree": True,
        "best_chain_checked_twice": True,
        "consensus_independently_validated": False,
        "chain_history_complete": False,
        "caveat": report["caveat"],
    }


def inspect_ethereum_reconciliation(report_path, ethereum_sample, *, sample_dir, as_of,
                                    max_age_seconds=ETHEREUM_RECONCILIATION_MAX_AGE_SECONDS):
    """Bind source agreement to one exact private Ethereum pilot, without identifiers."""
    report_raw = Path(report_path).read_bytes()
    report = json.loads(report_raw)
    expected_fields = {
        "schema_version", "kind", "retrieved_at", "primary_source_host", "secondary_source_host",
        "pilot_records_sha256", "pilot_manifest_sha256", "block_number", "sampled_transactions_compared",
        "block_hash_count_positions_agree", "sampled_transaction_receipt_identity_status_agree",
        "normalized_eth_usdt_usdc_movements_agree", "normalized_movements_compared",
        "secondary_finalized_head_and_height_checked_twice", "rpc_calls", "max_rpc_calls",
        "max_response_bytes_per_call", "max_total_response_bytes", "consensus_independently_validated",
        "operator_independence_verified", "full_receipt_payload_reconciled", "full_history_coverage",
        "aml_scores_computed", "caveat",
    }
    if not isinstance(report, dict) or set(report) != expected_fields:
        raise ValueError("invalid Ethereum reconciliation report fields")
    manifest_digest = hashlib.sha256(
        (Path(sample_dir) / "ethereum-pilot-manifest.json").read_bytes()).hexdigest()
    count = ethereum_sample["sampled_transactions"]
    if (type(report["schema_version"]) is not int or report["schema_version"] != 1
            or report["kind"] != "bounded_ethereum_second_source_reconciliation"
            or report["primary_source_host"] != ethereum_sample["source_host"]
            or not isinstance(report["secondary_source_host"], str)
            or not report["secondary_source_host"] or "/" in report["secondary_source_host"]
            or report["secondary_source_host"] == report["primary_source_host"]
            or report["pilot_records_sha256"] != ethereum_sample["sample_digest"]
            or report["pilot_manifest_sha256"] != manifest_digest
            or type(report["block_number"]) is not int
            or report["block_number"] != ethereum_sample["source_reported_finalized_block_number"]
            or type(report["sampled_transactions_compared"]) is not int
            or report["sampled_transactions_compared"] != count
            or report["block_hash_count_positions_agree"] is not True
            or report["sampled_transaction_receipt_identity_status_agree"] is not True
            or report["normalized_eth_usdt_usdc_movements_agree"] is not True
            or type(report["normalized_movements_compared"]) is not int
            or report["normalized_movements_compared"] != ethereum_sample["normalized_movements"]
            or report["secondary_finalized_head_and_height_checked_twice"] is not True
            or type(report["rpc_calls"]) is not int or report["rpc_calls"] != 6 + 2 * count
            or type(report["max_rpc_calls"]) is not int or report["max_rpc_calls"] != 26
            or type(report["max_response_bytes_per_call"]) is not int
            or report["max_response_bytes_per_call"] != 1_000_000
            or type(report["max_total_response_bytes"]) is not int
            or report["max_total_response_bytes"] != 26_000_000
            or report["consensus_independently_validated"] is not False
            or report["operator_independence_verified"] is not False
            or report["full_receipt_payload_reconciled"] is not False
            or report["full_history_coverage"] is not False
            or type(report["aml_scores_computed"]) is not int or report["aml_scores_computed"] != 0
            or report["caveat"] != "two public RPC hostnames agree on a bounded sample; no independent node or complete receipt replay"):
        raise ValueError("Ethereum reconciliation provenance mismatch")
    if type(max_age_seconds) is not int or max_age_seconds < 0:
        raise ValueError("invalid Ethereum reconciliation maximum age")
    try:
        observed = datetime.fromisoformat(report["retrieved_at"].replace("Z", "+00:00"))
        pilot_observed = datetime.fromisoformat(ethereum_sample["retrieved_at"].replace("Z", "+00:00"))
    except (AttributeError, TypeError, ValueError) as error:
        raise ValueError("invalid Ethereum reconciliation timestamp") from error
    if observed.tzinfo is None or pilot_observed.tzinfo is None:
        raise ValueError("Ethereum reconciliation timestamp has no timezone")
    age = (as_of - observed).total_seconds()
    if observed < pilot_observed or age < 0 or age > max_age_seconds:
        raise ValueError("stale or future Ethereum reconciliation")
    return {
        "kind": report["kind"], "retrieved_at": report["retrieved_at"],
        "age_seconds": int(age), "report_sha256": hashlib.sha256(report_raw).hexdigest(),
        "pilot_records_sha256": report["pilot_records_sha256"],
        "pilot_manifest_sha256": report["pilot_manifest_sha256"],
        "primary_source_host": report["primary_source_host"],
        "secondary_source_host": report["secondary_source_host"],
        "sampled_transactions_compared": count,
        "normalized_movements_compared": report["normalized_movements_compared"],
        "source_reported_finality_agree": True,
        "normalized_eth_usdt_usdc_movements_agree": True,
        "consensus_independently_validated": False,
        "operator_independence_verified": False,
        "chain_history_complete": False,
        "caveat": report["caveat"],
    }

def build_ledger(*, bloch_sample_dir=None, ethereum_pilot_dir=None, bitcoin_pilot_path=None,
                 bitcoin_reconciliation_path=None, ethereum_reconciliation_path=None,
                 chain_health_path=None, as_of=None):
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
    ethereum_sample = inspect_ethereum_pilot(ethereum_pilot_dir) if ethereum_pilot_dir is not None else None
    bitcoin_sample = inspect_bitcoin_pilot(bitcoin_pilot_path) if bitcoin_pilot_path is not None else None
    if bitcoin_reconciliation_path is not None and bitcoin_sample is None:
        raise ValueError("Bitcoin reconciliation requires a verified pilot")
    bitcoin_reconciliation = (inspect_bitcoin_reconciliation(bitcoin_reconciliation_path, bitcoin_sample, as_of=as_of)
                              if bitcoin_reconciliation_path is not None else None)
    if ethereum_reconciliation_path is not None and ethereum_sample is None:
        raise ValueError("Ethereum reconciliation requires a verified pilot")
    ethereum_reconciliation = (inspect_ethereum_reconciliation(
        ethereum_reconciliation_path, ethereum_sample, sample_dir=ethereum_pilot_dir, as_of=as_of)
        if ethereum_reconciliation_path is not None else None)
    entries = []
    for chain, asset in ASSETS:
        if chain == "bloch":
            source = bloch
            status = "bounded_private_sample" if bloch else "unavailable"
        elif chain == "bitcoin" and bitcoin_sample:
            source = bitcoin_sample
            status = "bounded_private_sample"
        elif chain == "ethereum" and ethereum_sample:
            source = ethereum_sample
            status = "bounded_private_sample"
        else:
            source = health.get(chain)
            status = "height_probe_only" if isinstance(source, dict) and source.get("status") == "reachable" else "unavailable"
        entry = {
            "chain": chain,
            "asset": asset,
            "status": status,
            "unit": UNITS[asset],
            "amounts_are_exact_integers": True if status == "bounded_private_sample" else None,
            "live_transactions_ingested": 0,
            "production_coverage_asserted": False,
            "aml_scores_computed": 0,
            "freshness": freshness(source.get("retrieved_at") if status == "bounded_private_sample" else health_retrieved_at if source else None, as_of),
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
        elif chain == "ethereum" and status == "bounded_private_sample":
            symbol = {"ETH": "eth", "USDT-ERC20": "usdt", "USDC-ERC20": "usdc"}[asset]
            entry["private_sample"] = {
                "kind": source["kind"], "sample_digest": source["sample_digest"],
                "sampled_transactions": source["sampled_transactions"],
                "sampled_asset_movements": source["movement_counts"][symbol],
                "sample_selection": source["sample_selection"],
                "quality_gate": source["quality_gate"], "caveat": source["caveat"],
            }
            if ethereum_reconciliation is not None:
                entry["second_source_reconciliation"] = ethereum_reconciliation
                entry["independent_source_reconciliation"] = "bounded_second_public_rpc_agreement_not_node_validated"
            entry["finality_evidence"] = "rpc_reported_finalized_block_not_independently_verified"
            entry["lineage"] = {"source_id": source["source_id"], "source_host": source["source_host"],
                                "sample_sha256": source["sample_digest"]}
            entry["completeness"] = {
                "bounded_sample_records_verified": True,
                "sampled_transactions": source["sampled_transactions"],
                "sampled_asset_movements": source["movement_counts"][symbol],
                "chain_transaction_total": None,
                "chain_transaction_coverage_fraction": None,
                "token_or_asset_specific_event_coverage": None,
            }
        elif chain == "bitcoin" and status == "bounded_private_sample":
            entry["private_sample"] = source
            if bitcoin_reconciliation is not None:
                entry["second_source_reconciliation"] = bitcoin_reconciliation
                entry["independent_source_reconciliation"] = "bounded_second_public_operator_agreement_not_node_validated"
            entry["finality_evidence"] = "source_reported_probabilistic_confirmations_not_independently_verified"
            entry["lineage"] = {"source_id": source["source_id"], "sample_sha256": source["sample_digest"]}
            entry["completeness"] = {
                "bounded_sample_records_verified": True,
                "sampled_transactions": source["sampled_transactions"],
                "sampled_outputs": source["sampled_outputs"],
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
            entry["token_log_ingestion"] = "bounded_private_sample_only" if status == "bounded_private_sample" and chain == "ethereum" else "none"
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
    parser.add_argument("--ethereum-pilot-dir", type=Path)
    parser.add_argument("--bitcoin-pilot", type=Path)
    parser.add_argument("--bitcoin-reconciliation", type=Path)
    parser.add_argument("--ethereum-reconciliation", type=Path)
    parser.add_argument("--chain-health", type=Path)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    ledger = build_ledger(bloch_sample_dir=args.bloch_sample_dir, ethereum_pilot_dir=args.ethereum_pilot_dir,
                          bitcoin_pilot_path=args.bitcoin_pilot,
                          bitcoin_reconciliation_path=args.bitcoin_reconciliation,
                          ethereum_reconciliation_path=args.ethereum_reconciliation,
                          chain_health_path=args.chain_health)
    write_private(ledger, args.output)
    print(json.dumps({"kind": ledger["kind"], "assets": {row["asset"]: row["status"] for row in ledger["assets"]}, "production_ready": False}))


if __name__ == "__main__":
    main()
