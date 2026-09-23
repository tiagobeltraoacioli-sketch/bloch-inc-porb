"""Bounded, private Ethereum finalized-block research pilot.

This samples transaction hashes from one source-reported finalized block. It
does not establish chain coverage, person ownership, AML findings, or an API.
"""

import argparse
import hashlib
import json
import os
import re
from dataclasses import asdict
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import urlsplit
from urllib.request import Request, urlopen

from .chain_health import ETH_RPC
from .ethereum import TOKEN_CONTRACTS, erc20_transfers, native_value_movement


HEX64 = re.compile(r"0x[0-9a-fA-F]{64}\Z")
ADDRESS = re.compile(r"0x[0-9a-fA-F]{40}\Z")
HEX_QUANTITY = re.compile(r"0x(?:0|[1-9a-fA-F][0-9a-fA-F]*)\Z")
MAX_RESPONSE = 2_000_000


def rpc(url, method, params):
    payload = json.dumps({"jsonrpc": "2.0", "method": method, "params": params, "id": 1}).encode()
    request = Request(url, data=payload, headers={
        "Content-Type": "application/json", "User-Agent": "BlochInc-PoRB/0.1 private-ethereum-pilot",
    })
    with urlopen(request, timeout=20) as response:
        raw = response.read(MAX_RESPONSE + 1)
    if len(raw) > MAX_RESPONSE:
        raise ValueError("Ethereum RPC response exceeds bound")
    body = json.loads(raw)
    if not isinstance(body, dict) or body.get("id") != 1 or body.get("error") or "result" not in body:
        raise ValueError("invalid Ethereum RPC response")
    return body["result"]


def _quantity(value):
    if not isinstance(value, str) or not HEX_QUANTITY.fullmatch(value):
        raise ValueError("invalid Ethereum quantity")
    return int(value, 16)


def _validate_receipt_logs(receipt, *, tx_hash, block_hash, block_number, transaction_index):
    """Check every receipt log's placement, including logs from other contracts."""
    logs = receipt.get("logs")
    if not isinstance(logs, list):
        raise ValueError("Ethereum receipt logs required")
    previous_log_index = -1
    for log in logs:
        if (not isinstance(log, dict) or log.get("removed") is True
                or not isinstance(log.get("address"), str) or not ADDRESS.fullmatch(log["address"])
                or str(log.get("blockHash", "")).lower() != block_hash
                or str(log.get("transactionHash", "")).lower() != tx_hash
                or _quantity(log.get("blockNumber")) != block_number
                or _quantity(log.get("transactionIndex")) != transaction_index):
            raise ValueError("Ethereum receipt log placement mismatch")
        log_index = _quantity(log.get("logIndex"))
        if log_index <= previous_log_index:
            raise ValueError("Ethereum receipt logs out of order or duplicated")
        previous_log_index = log_index


def collect(*, limit=5, block_number=None, fetch=rpc, rpc_url=ETH_RPC):
    if type(limit) is not int or not 1 <= limit <= 10:
        raise ValueError("pilot limit must be 1-10 transactions")
    if block_number is not None and (type(block_number) is not int or block_number < 0):
        raise ValueError("pilot block number must be nonnegative")
    chain_id = fetch(rpc_url, "eth_chainId", [])
    if not isinstance(chain_id, str) or not HEX_QUANTITY.fullmatch(chain_id) or int(chain_id, 16) != 1:
        raise ValueError("Ethereum mainnet chain ID required")
    finalized_head = fetch(rpc_url, "eth_getBlockByNumber", ["finalized", False])
    if (not isinstance(finalized_head, dict)
            or not HEX64.fullmatch(finalized_head.get("hash", ""))):
        raise ValueError("invalid finalized head response")
    finalized_head_number = _quantity(finalized_head.get("number"))
    if block_number is not None and block_number > finalized_head_number:
        raise ValueError("requested block exceeds source-reported finalized head")
    requested_block_number = block_number
    block = (finalized_head if requested_block_number is None else
             fetch(rpc_url, "eth_getBlockByNumber", [hex(block_number), False]))
    if (not isinstance(block, dict) or not HEX64.fullmatch(block.get("hash", ""))
            or not isinstance(block.get("number"), str) or not HEX_QUANTITY.fullmatch(block["number"])
            or not isinstance(block.get("transactions"), list)
            or any(not isinstance(item, str) or not HEX64.fullmatch(item) for item in block["transactions"])):
        raise ValueError("invalid finalized block response")
    block_hash = block["hash"].lower()
    block_number = int(block["number"], 16)
    if requested_block_number is not None and block_number != requested_block_number:
        raise ValueError("selected block height differs from request")
    if block_number > finalized_head_number:
        raise ValueError("selected block exceeds source-reported finalized head")
    if len(set(tx_hash.lower() for tx_hash in block["transactions"])) != len(block["transactions"]):
        raise ValueError("duplicate transaction hash in finalized block")
    selected = block["transactions"][:limit]
    records = []
    movements = []
    for position, tx_hash in enumerate(selected):
        tx = fetch(rpc_url, "eth_getTransactionByHash", [tx_hash])
        receipt = fetch(rpc_url, "eth_getTransactionReceipt", [tx_hash])
        if not isinstance(tx, dict) or not isinstance(receipt, dict):
            raise ValueError("sampled transaction or receipt missing")
        if (str(tx.get("hash", "")).lower() != tx_hash.lower()
                or str(tx.get("blockHash", "")).lower() != block_hash
                or str(receipt.get("blockHash", "")).lower() != block_hash
                or str(receipt.get("transactionHash", "")).lower() != tx_hash.lower()
                or str(tx.get("blockNumber", "")).lower() != block["number"].lower()
                or str(receipt.get("blockNumber", "")).lower() != block["number"].lower()
                or _quantity(tx.get("transactionIndex")) != position
                or _quantity(receipt.get("transactionIndex")) != position
                or receipt.get("status") not in ("0x0", "0x1")):
            raise ValueError("sampled transaction, receipt, or finalized block mismatch")
        _validate_receipt_logs(receipt, tx_hash=tx_hash.lower(), block_hash=block_hash,
                               block_number=block_number, transaction_index=position)
        records.append({"record_type": "sampled_transaction", "tx_id": tx_hash.lower(),
                        "block_hash": block_hash, "block_number": block_number,
                        "transaction_index": int(tx["transactionIndex"], 16),
                        "receipt_status": receipt["status"], "source_id": "ethereum-mainnet-rpc"})
        native = native_value_movement(block, tx, receipt, source_id="ethereum-mainnet-rpc")
        if native is not None:
            movements.append(native)
        if receipt["status"] == "0x1":
            movements.extend(erc20_transfers(block, receipt, source_id="ethereum-mainnet-rpc"))
    keys = set()
    for movement in movements:
        if movement.key in keys:
            raise ValueError("duplicate normalized Ethereum event")
        keys.add(movement.key)
        records.append({"record_type": "normalized_movement", "event_key": movement.key,
                        **asdict(movement)})
    counts = {"eth": 0, "usdt": 0, "usdc": 0}
    for movement in movements:
        if movement.asset_id == "eth":
            counts["eth"] += 1
        elif movement.asset_id.startswith("erc20:"):
            counts[TOKEN_CONTRACTS[movement.asset_id[6:]]] += 1
    manifest = {
        "status": "bounded_private_ethereum_research_sample",
        "retrieved_at": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
        "source_id": "ethereum-mainnet-rpc", "source_host": urlsplit(rpc_url).hostname, "chain_id": 1,
        "source_reported_finalized_block_number": block_number,
        "source_reported_finalized_block_hash": block_hash,
        "finalized_head_number_at_collection": finalized_head_number,
        "block_transaction_count": len(block["transactions"]),
        "sampled_transactions": len(selected), "sample_selection": "first_transaction_hashes_in_source_reported_finalized_block",
        "within_block_sample_fraction": len(selected) / len(block["transactions"]) if block["transactions"] else None,
        "normalized_movements": len(movements), "movement_counts": counts,
        "block_transaction_coverage_fraction": None, "chain_history_complete": False,
        "independent_finality_reconciled": False, "wallet_scores_computed": 0,
    }
    return manifest, records


def write_private(manifest, records, output_dir):
    output_dir = Path(output_dir)
    output_dir.mkdir(mode=0o700, parents=True, exist_ok=True)
    os.chmod(output_dir, 0o700)
    payload = "".join(json.dumps(row, sort_keys=True, separators=(",", ":")) + "\n" for row in records).encode()
    manifest = dict(manifest, records_sha256=hashlib.sha256(payload).hexdigest(), record_count=len(records))
    for name, content in (("ethereum-pilot.jsonl", payload),
                          ("ethereum-pilot-manifest.json", (json.dumps(manifest, sort_keys=True, indent=2) + "\n").encode())):
        destination = output_dir / name
        temporary = output_dir / (name + ".tmp")
        descriptor = os.open(temporary, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
        with os.fdopen(descriptor, "wb") as handle:
            handle.write(content)
            handle.flush()
            os.fsync(handle.fileno())
        os.replace(temporary, destination)
    return manifest


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--limit", type=int, default=5)
    parser.add_argument("--block-number", type=int,
                        help="select a historical height at or below the source-reported finalized head")
    parser.add_argument("--output-dir", type=Path, required=True)
    args = parser.parse_args()
    manifest, records = collect(limit=args.limit, block_number=args.block_number)
    saved = write_private(manifest, records, args.output_dir)
    print(json.dumps({key: saved[key] for key in ("status", "sampled_transactions", "normalized_movements", "movement_counts", "record_count")}))


if __name__ == "__main__":
    main()
