"""Private, bounded comparison of an Ethereum pilot with another RPC operator."""

import argparse
import hashlib
import json
import os
import tempfile
from dataclasses import asdict
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import urlsplit
from urllib.request import Request, urlopen

from .data_quality import inspect_ethereum_pilot
from .ethereum import erc20_transfers, native_value_movement
from .ethereum_pilot import HEX64, HEX_QUANTITY, _validate_receipt_logs


SECONDARY_RPC = "https://eth.drpc.org/"
MAX_RESPONSE_BYTES = 1_000_000
MAX_TRANSACTIONS = 10
MAX_RPC_CALLS = 6 + 2 * MAX_TRANSACTIONS
MAX_TOTAL_RESPONSE_BYTES = MAX_RPC_CALLS * MAX_RESPONSE_BYTES
MAX_PILOT_BYTES = 2_000_000


def _quantity(value):
    if not isinstance(value, str) or not HEX_QUANTITY.fullmatch(value):
        raise ValueError("invalid secondary Ethereum quantity")
    return int(value, 16)


def _hash(value):
    if not isinstance(value, str) or not HEX64.fullmatch(value):
        raise ValueError("invalid secondary Ethereum hash")
    return value.lower()


def rpc(url, method, params):
    payload = json.dumps({"jsonrpc": "2.0", "method": method, "params": params, "id": 1}).encode()
    request = Request(url, data=payload, headers={
        "Content-Type": "application/json", "User-Agent": "BlochInc-PoRB/0.1 private-ethereum-reconcile",
    })
    with urlopen(request, timeout=15) as response:
        raw = response.read(MAX_RESPONSE_BYTES + 1)
        if "application/json" not in response.headers.get("Content-Type", ""):
            raise ValueError("unexpected secondary Ethereum content type")
    if len(raw) > MAX_RESPONSE_BYTES:
        raise ValueError("secondary Ethereum RPC response exceeds bound")
    body = json.loads(raw)
    if (not isinstance(body, dict) or body.get("jsonrpc") != "2.0" or body.get("id") != 1
            or body.get("error") or "result" not in body):
        raise ValueError("invalid secondary Ethereum RPC response")
    return body["result"]


def _block_matches(block, *, expected_hash, expected_number, expected_count, selected):
    if (not isinstance(block, dict) or _hash(block.get("hash")) != expected_hash
            or _quantity(block.get("number")) != expected_number
            or not isinstance(block.get("transactions"), list)
            or len(block["transactions"]) != expected_count):
        raise ValueError("secondary Ethereum block identity or count differs")
    if [_hash(item) for item in block["transactions"][:len(selected)]] != selected:
        raise ValueError("secondary Ethereum sampled positions differ")


def reconcile(pilot_dir, *, fetch=rpc, rpc_url=SECONDARY_RPC):
    """Compare one verified pilot; no consensus or operator independence proof."""
    pilot_dir = Path(pilot_dir)
    manifest_path = pilot_dir / "ethereum-pilot-manifest.json"
    records_path = pilot_dir / "ethereum-pilot.jsonl"
    if manifest_path.stat().st_size > MAX_PILOT_BYTES or records_path.stat().st_size > MAX_PILOT_BYTES:
        raise ValueError("Ethereum pilot artifact exceeds reconciliation bound")
    evidence = inspect_ethereum_pilot(pilot_dir)
    manifest = json.loads(manifest_path.read_bytes())
    rows = [json.loads(line) for line in records_path.read_bytes().splitlines()]
    sampled = [row for row in rows if row["record_type"] == "sampled_transaction"]
    if not 1 <= len(sampled) <= MAX_TRANSACTIONS:
        raise ValueError("Ethereum reconciliation requires 1-10 sampled transactions")
    sampled.sort(key=lambda row: row["transaction_index"])
    if [row["transaction_index"] for row in sampled] != list(range(len(sampled))):
        raise ValueError("Ethereum pilot sampled positions are not the first contiguous positions")
    selected = [row["tx_id"] for row in sampled]
    primary_movements = sorted(
        (row for row in rows if row["record_type"] == "normalized_movement"),
        key=lambda row: row["event_key"],
    )
    primary_host = manifest.get("source_host")
    secondary_parts = urlsplit(rpc_url)
    if (secondary_parts.scheme != "https" or not secondary_parts.hostname
            or not isinstance(primary_host, str) or not primary_host
            or secondary_parts.hostname.lower() == primary_host.lower()):
        raise ValueError("distinct HTTPS RPC host required")

    calls = 0

    def get(method, params):
        nonlocal calls
        calls += 1
        if calls > MAX_RPC_CALLS:
            raise ValueError("Ethereum reconciliation RPC call bound exceeded")
        return fetch(rpc_url, method, params)

    if _quantity(get("eth_chainId", [])) != 1:
        raise ValueError("secondary RPC is not Ethereum mainnet")
    height = manifest["source_reported_finalized_block_number"]
    block_hash = manifest["source_reported_finalized_block_hash"]
    count = manifest["block_transaction_count"]
    finalized_before = get("eth_getBlockByNumber", ["finalized", False])
    if not isinstance(finalized_before, dict) or _quantity(finalized_before.get("number")) < height:
        raise ValueError("secondary RPC has not finalized sampled height")
    at_height = get("eth_getBlockByNumber", [hex(height), False])
    _block_matches(at_height, expected_hash=block_hash, expected_number=height,
                   expected_count=count, selected=selected)
    by_hash = get("eth_getBlockByHash", [block_hash, False])
    _block_matches(by_hash, expected_hash=block_hash, expected_number=height,
                   expected_count=count, selected=selected)
    secondary_movements = []
    for row in sampled:
        txid = row["tx_id"]
        position = row["transaction_index"]
        tx = get("eth_getTransactionByHash", [txid])
        receipt = get("eth_getTransactionReceipt", [txid])
        if (not isinstance(tx, dict) or not isinstance(receipt, dict)
                or _hash(tx.get("hash")) != txid
                or _hash(tx.get("blockHash")) != block_hash
                or _quantity(tx.get("blockNumber")) != height
                or _quantity(tx.get("transactionIndex")) != position
                or _hash(receipt.get("transactionHash")) != txid
                or _hash(receipt.get("blockHash")) != block_hash
                or _quantity(receipt.get("blockNumber")) != height
                or _quantity(receipt.get("transactionIndex")) != position
                or receipt.get("status") != row["receipt_status"]):
            raise ValueError("secondary Ethereum sampled transaction or receipt differs")
        _validate_receipt_logs(receipt, tx_hash=txid, block_hash=block_hash,
                               block_number=height, transaction_index=position)
        native = native_value_movement(at_height, tx, receipt, source_id=manifest["source_id"])
        if native is not None:
            secondary_movements.append(native)
        if receipt["status"] == "0x1":
            secondary_movements.extend(erc20_transfers(at_height, receipt, source_id=manifest["source_id"]))
    normalized_secondary = sorted(
        ({"record_type": "normalized_movement", "event_key": movement.key,
          **asdict(movement)} for movement in secondary_movements),
        key=lambda row: row["event_key"],
    )
    if normalized_secondary != primary_movements:
        raise ValueError("secondary Ethereum normalized movements differ")
    finalized_after = get("eth_getBlockByNumber", ["finalized", False])
    at_height_again = get("eth_getBlockByNumber", [hex(height), False])
    if (not isinstance(finalized_after, dict)
            or _quantity(finalized_after.get("number")) < _quantity(finalized_before["number"])):
        raise ValueError("secondary Ethereum finalized head regressed during comparison")
    _block_matches(at_height_again, expected_hash=block_hash, expected_number=height,
                   expected_count=count, selected=selected)
    return {
        "schema_version": 1,
        "kind": "bounded_ethereum_second_source_reconciliation",
        "retrieved_at": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
        "primary_source_host": primary_host,
        "secondary_source_host": secondary_parts.hostname,
        "pilot_records_sha256": evidence["sample_digest"],
        "pilot_manifest_sha256": hashlib.sha256(manifest_path.read_bytes()).hexdigest(),
        "block_number": height,
        "sampled_transactions_compared": len(sampled),
        "block_hash_count_positions_agree": True,
        "sampled_transaction_receipt_identity_status_agree": True,
        "normalized_eth_usdt_usdc_movements_agree": True,
        "normalized_movements_compared": len(normalized_secondary),
        "secondary_finalized_head_and_height_checked_twice": True,
        "rpc_calls": calls,
        "max_rpc_calls": MAX_RPC_CALLS,
        "max_response_bytes_per_call": MAX_RESPONSE_BYTES,
        "max_total_response_bytes": MAX_TOTAL_RESPONSE_BYTES,
        "consensus_independently_validated": False,
        "operator_independence_verified": False,
        "full_receipt_payload_reconciled": False,
        "full_history_coverage": False,
        "aml_scores_computed": 0,
        "caveat": "two public RPC hostnames agree on a bounded sample; no independent node or complete receipt replay",
    }


def write_private(report, output_path):
    output_path = Path(output_path)
    output_path.parent.mkdir(parents=True, mode=0o700, exist_ok=True)
    os.chmod(output_path.parent, 0o700)
    payload = (json.dumps(report, sort_keys=True, separators=(",", ":")) + "\n").encode()
    descriptor, name = tempfile.mkstemp(prefix=".ethereum-reconcile-", suffix=".tmp", dir=output_path.parent)
    temporary = Path(name)
    try:
        os.chmod(temporary, 0o600)
        with os.fdopen(descriptor, "wb") as handle:
            handle.write(payload)
            handle.flush()
            os.fsync(handle.fileno())
        os.replace(temporary, output_path)
    finally:
        if temporary.exists():
            temporary.unlink()
    return hashlib.sha256(payload).hexdigest()


def main():
    parser = argparse.ArgumentParser(description="Private bounded Ethereum second-RPC comparison")
    parser.add_argument("--pilot-dir", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    report = reconcile(args.pilot_dir, rpc_url=os.environ.get("PORB_ETH_SECONDARY_RPC", SECONDARY_RPC))
    digest = write_private(report, args.output)
    print(json.dumps({"kind": report["kind"], "sampled_transactions_compared": report["sampled_transactions_compared"],
                      "sources_agree": True, "report_sha256": digest}))


if __name__ == "__main__":
    main()
