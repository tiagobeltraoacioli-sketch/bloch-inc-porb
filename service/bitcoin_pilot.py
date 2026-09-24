"""Bounded private Bitcoin mainnet block pilot using the public Esplora API.

Bitcoin confirmations are probabilistic. Inputs reference outpoints, not people.
"""

import argparse
import hashlib
import json
import os
import re
import tempfile
from datetime import datetime, timezone
from pathlib import Path
from urllib.request import Request, urlopen


API = "https://blockstream.info/api"
SOURCE_ID = "blockstream-esplora-bitcoin-mainnet"
HEX64 = re.compile(r"[0-9a-fA-F]{64}\Z")
HEX_SCRIPT = re.compile(r"(?:[0-9a-fA-F]{2}){0,5000}\Z")
ADDRESS = re.compile(r"[A-Za-z0-9]{14,90}\Z")
MAX_RESPONSE_BYTES = 1_000_000


def _hex64(value, name):
    if not isinstance(value, str) or not HEX64.fullmatch(value):
        raise ValueError(f"invalid {name}")
    return value.lower()


def _nonnegative(value, name):
    if type(value) is not int or value < 0:
        raise ValueError(f"invalid {name}")
    return value


def _height(value):
    if not isinstance(value, str) or not re.fullmatch(r"[0-9]{1,10}", value.strip()):
        raise ValueError("invalid Bitcoin height")
    return int(value.strip())


def fetch(path):
    if not path.startswith("/") or ".." in path or "?" in path or "#" in path:
        raise ValueError("invalid Esplora path")
    request = Request(API + path, headers={"Accept": "application/json, text/plain", "User-Agent": "BlochInc-PoRB/0.1 bounded-bitcoin-pilot"})
    with urlopen(request, timeout=15) as response:
        raw = response.read(MAX_RESPONSE_BYTES + 1)
        content_type = response.headers.get("Content-Type", "")
    if len(raw) > MAX_RESPONSE_BYTES:
        raise ValueError("Esplora response exceeds bound")
    if (path == "/blocks/tip/height" or path.startswith("/block-height/")
            or "/txid/" in path or path.endswith("/header") or path.endswith("/hex")):
        if "text/plain" not in content_type:
            raise ValueError("unexpected Esplora text content type")
        return raw.decode("ascii").strip()
    if "application/json" not in content_type:
        raise ValueError("unexpected Esplora JSON content type")
    return json.loads(raw)


def _output(item, txid, index):
    if not isinstance(item, dict):
        raise ValueError("invalid Bitcoin output")
    value = _nonnegative(item.get("value"), "output satoshis")
    if value > 2_100_000_000_000_000:
        raise ValueError("output exceeds Bitcoin supply bound")
    script = item.get("scriptpubkey")
    if not isinstance(script, str) or not HEX_SCRIPT.fullmatch(script):
        raise ValueError("invalid output script")
    address = item.get("scriptpubkey_address")
    if address is not None and (not isinstance(address, str) or not ADDRESS.fullmatch(address)):
        raise ValueError("invalid source-reported output address")
    return {"txid": txid, "vout": index, "value_sat": str(value), "scriptpubkey_hex": script.lower(),
            "source_reported_address": address, "unspent_status": "unknown_not_queried"}


def _input(item):
    if not isinstance(item, dict):
        raise ValueError("invalid Bitcoin input")
    if item.get("is_coinbase") is True:
        return {"kind": "coinbase_input", "spent_outpoint": None}
    if item.get("is_coinbase") not in (False, None):
        raise ValueError("invalid coinbase flag")
    return {"kind": "spent_outpoint_reference", "spent_outpoint": {
        "txid": _hex64(item.get("txid"), "prior transaction ID"),
        "vout": _nonnegative(item.get("vout"), "prior output index"),
    }}


def _double_sha256(payload):
    return hashlib.sha256(hashlib.sha256(payload).digest()).digest()


def verify_header(header_hex, block_hash, merkle_root):
    """Verify the 80-byte header hash and its Merkle root against block metadata."""
    if not isinstance(header_hex, str) or len(header_hex) != 160 or re.fullmatch(r"[0-9a-fA-F]{160}", header_hex) is None:
        raise ValueError("invalid Bitcoin block header")
    header = bytes.fromhex(header_hex)
    if _double_sha256(header)[::-1].hex() != block_hash:
        raise ValueError("Bitcoin block header hash mismatch")
    if header[36:68][::-1].hex() != merkle_root:
        raise ValueError("Bitcoin block header Merkle root mismatch")


def verify_merkle_proof(txid, position, height, proof, merkle_root):
    """Compute an Electrum-format transaction branch against the selected header."""
    if (not isinstance(proof, dict) or type(proof.get("block_height")) is not int
            or proof["block_height"] != height or type(proof.get("pos")) is not int
            or proof["pos"] != position or not isinstance(proof.get("merkle"), list)
            or len(proof["merkle"]) > 32):
        raise ValueError("invalid Bitcoin Merkle proof position")
    node = bytes.fromhex(_hex64(txid, "proof transaction ID"))[::-1]
    index = position
    for sibling_hex in proof["merkle"]:
        sibling = bytes.fromhex(_hex64(sibling_hex, "Merkle sibling"))[::-1]
        node = _double_sha256((sibling + node) if index & 1 else (node + sibling))
        index >>= 1
    if index or node[::-1].hex() != merkle_root:
        raise ValueError("Bitcoin Merkle inclusion mismatch")
    return [_hex64(sibling, "Merkle sibling") for sibling in proof["merkle"]]


def _transaction(tx, expected_txid, block_hash, height):
    if not isinstance(tx, dict) or _hex64(tx.get("txid"), "transaction ID") != expected_txid:
        raise ValueError("transaction ID differs from block index")
    status = tx.get("status")
    if (not isinstance(status, dict) or status.get("confirmed") is not True or
            _hex64(status.get("block_hash"), "transaction block") != block_hash or
            status.get("block_height") != height or type(status.get("block_height")) is not int):
        raise ValueError("transaction status differs from selected block")
    if not isinstance(tx.get("vin"), list) or not isinstance(tx.get("vout"), list):
        raise ValueError("transaction inputs and outputs required")
    return {
        "txid": expected_txid,
        "inputs": [_input(item) for item in tx["vin"]],
        "outputs": [_output(item, expected_txid, index) for index, item in enumerate(tx["vout"])],
        "output_count": len(tx["vout"]),
        "input_ownership_inferred": False,
        "single_sender_inferred": False,
    }


def collect(*, min_confirmations=6, tx_limit=5, get=fetch):
    if type(min_confirmations) is not int or not 1 <= min_confirmations <= 144:
        raise ValueError("confirmations must be 1–144")
    if type(tx_limit) is not int or not 1 <= tx_limit <= 5:
        raise ValueError("transaction limit must be 1–5")
    first_tip = _height(get("/blocks/tip/height"))
    if first_tip < min_confirmations:
        raise ValueError("tip too low for requested depth")
    height = first_tip - min_confirmations + 1
    block_hash = _hex64(get(f"/block-height/{height}"), "block hash by height")
    block = get(f"/block/{block_hash}")
    if (not isinstance(block, dict) or _hex64(block.get("id"), "block ID") != block_hash or
            type(block.get("height")) is not int or block["height"] != height or
            type(block.get("tx_count")) is not int or block["tx_count"] < 1):
        raise ValueError("block metadata differs from selected height")
    merkle_root = _hex64(block.get("merkle_root"), "block Merkle root")
    header_hex = get(f"/block/{block_hash}/header")
    verify_header(header_hex, block_hash, merkle_root)
    first_status = get(f"/block/{block_hash}/status")
    if not isinstance(first_status, dict) or first_status.get("in_best_chain") is not True:
        raise ValueError("selected block is not in source-reported best chain")
    transactions = []
    for index in range(min(tx_limit, block["tx_count"])):
        txid = _hex64(get(f"/block/{block_hash}/txid/{index}"), "block transaction ID")
        tx = get(f"/tx/{txid}")
        observed = _transaction(tx, txid, block_hash, height)
        observed["merkle_branch"] = verify_merkle_proof(
            txid, index, height, get(f"/tx/{txid}/merkle-proof"), merkle_root)
        observed["merkle_position"] = index
        coinbase_inputs = sum(item["kind"] == "coinbase_input" for item in observed["inputs"])
        if (index == 0 and (coinbase_inputs != 1 or len(observed["inputs"]) != 1)) or (index > 0 and coinbase_inputs):
            raise ValueError("coinbase input conflicts with block transaction position")
        transactions.append(observed)
    if len({item["txid"] for item in transactions}) != len(transactions):
        raise ValueError("duplicate transaction ID in block sample")
    final_tip = _height(get("/blocks/tip/height"))
    final_hash_at_height = _hex64(get(f"/block-height/{height}"), "final block hash by height")
    final_status = get(f"/block/{block_hash}/status")
    if final_tip < first_tip or final_hash_at_height != block_hash or not isinstance(final_status, dict) or final_status.get("in_best_chain") is not True:
        raise ValueError("source-reported chain changed during sample")
    confirmations = final_tip - height + 1
    if confirmations < min_confirmations:
        raise ValueError("source-reported confirmations below requested depth")
    observations = {
        "schema_version": 2, "kind": "bounded_private_bitcoin_block_pilot",
        "chain": "bitcoin", "network": "mainnet", "source_id": SOURCE_ID,
        "source_url": API, "retrieved_at": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
        "block_hash": block_hash, "block_height": height,
        "block_merkle_root_source_reported": block["merkle_root"].lower(),
        "block_header_hex": header_hex.lower(),
        "block_tx_count_source_reported": block["tx_count"],
        "first_tip_height": first_tip, "final_tip_height": final_tip,
        "confirmations_source_reported": confirmations,
        "sampled_transactions": len(transactions),
        "sampled_outputs": sum(item["output_count"] for item in transactions),
        "sampled_spent_outpoint_references": sum(
            input_row["kind"] == "spent_outpoint_reference"
            for tx in transactions for input_row in tx["inputs"]
        ),
        "transactions": transactions,
        "source_reported_best_chain_checked_twice": True,
        "header_hash_locally_verified": True,
        "merkle_inclusion_locally_verified": True,
        "merkle_inclusion_independently_verified": False,
        "independent_node_reconciliation": False, "full_history_coverage": False,
        "sender_ownership_inferred": False, "aml_scores_computed": 0,
        "finality": "probabilistic_source_reported_confirmations_only",
    }
    return observations


def write_private(sample, output_path):
    output_path = Path(output_path)
    output_path.parent.mkdir(parents=True, mode=0o700, exist_ok=True)
    os.chmod(output_path.parent, 0o700)
    payload = (json.dumps(sample, sort_keys=True, separators=(",", ":")) + "\n").encode()
    fd, name = tempfile.mkstemp(prefix=".bitcoin-pilot-", suffix=".tmp", dir=output_path.parent)
    temporary = Path(name)
    try:
        os.chmod(temporary, 0o600)
        with os.fdopen(fd, "wb") as handle:
            handle.write(payload)
            handle.flush()
            os.fsync(handle.fileno())
        os.replace(temporary, output_path)
    finally:
        if temporary.exists():
            temporary.unlink()
    return hashlib.sha256(payload).hexdigest()


def main():
    parser = argparse.ArgumentParser(description="Bounded, private Bitcoin block research pilot")
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--min-confirmations", type=int, default=6)
    parser.add_argument("--tx-limit", type=int, default=5)
    args = parser.parse_args()
    sample = collect(min_confirmations=args.min_confirmations, tx_limit=args.tx_limit)
    digest = write_private(sample, args.output)
    print(json.dumps({"kind": sample["kind"], "sampled_transactions": sample["sampled_transactions"],
                      "confirmations_source_reported": sample["confirmations_source_reported"],
                      "artifact_sha256": digest}))


if __name__ == "__main__":
    main()
