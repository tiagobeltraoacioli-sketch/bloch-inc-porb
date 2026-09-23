"""Bounded, private second-operator comparison for a Bitcoin block pilot."""

import argparse
import hashlib
import json
import os
import re
import tempfile
from datetime import datetime, timezone
from pathlib import Path
from urllib.request import Request, urlopen

from .bitcoin_pilot import _height, _hex64, verify_header, verify_merkle_proof
from .data_quality import inspect_bitcoin_pilot


SECONDARY_API = "https://mempool.space/api"
SECONDARY_SOURCE_ID = "mempool-space-bitcoin-mainnet"
MAX_RESPONSE_BYTES = 1_000_000


def fetch_secondary(path):
    if not re.fullmatch(r"/[a-z0-9/\-]+", path):
        raise ValueError("invalid secondary source path")
    request = Request(SECONDARY_API + path, headers={
        "Accept": "application/json, text/plain", "User-Agent": "BlochInc-PoRB/0.1 bounded-second-source-check",
    })
    with urlopen(request, timeout=15) as response:
        raw = response.read(MAX_RESPONSE_BYTES + 1)
        content_type = response.headers.get("Content-Type", "")
    if len(raw) > MAX_RESPONSE_BYTES:
        raise ValueError("secondary source response exceeds bound")
    if path == "/blocks/tip/height" or path.startswith("/block-height/") or path.endswith("/header") or "/txid/" in path:
        if "text/plain" not in content_type:
            raise ValueError("unexpected secondary text content type")
        return raw.decode("ascii").strip()
    if "application/json" not in content_type:
        raise ValueError("unexpected secondary JSON content type")
    return json.loads(raw)


def reconcile(pilot_path, *, get=fetch_secondary):
    """Compare a verified schema-v2 sample with a second public operator."""
    source = inspect_bitcoin_pilot(pilot_path)
    sample = json.loads(Path(pilot_path).read_bytes())
    if sample.get("schema_version") != 2:
        raise ValueError("schema-v2 Bitcoin pilot required for second-source reconciliation")
    height = sample["block_height"]
    block_hash = sample["block_hash"]
    merkle_root = sample["block_merkle_root_source_reported"]
    first_tip = _height(get("/blocks/tip/height"))
    if first_tip - height + 1 < sample["confirmations_source_reported"]:
        raise ValueError("secondary source has insufficient confirmation depth")
    if _hex64(get(f"/block-height/{height}"), "secondary block hash") != block_hash:
        raise ValueError("secondary source block hash differs")
    secondary_header = get(f"/block/{block_hash}/header")
    verify_header(secondary_header, block_hash, merkle_root)
    if secondary_header.lower() != sample["block_header_hex"]:
        raise ValueError("secondary source block header differs")
    first_status = get(f"/block/{block_hash}/status")
    if not isinstance(first_status, dict) or first_status.get("in_best_chain") is not True:
        raise ValueError("secondary source does not report selected block in best chain")
    for index, transaction in enumerate(sample["transactions"]):
        txid = _hex64(get(f"/block/{block_hash}/txid/{index}"), "secondary transaction ID")
        if txid != transaction["txid"]:
            raise ValueError("secondary source transaction position differs")
        proof = get(f"/tx/{txid}/merkle-proof")
        verify_merkle_proof(txid, index, height, proof, merkle_root)
    final_tip = _height(get("/blocks/tip/height"))
    final_hash = _hex64(get(f"/block-height/{height}"), "secondary final block hash")
    final_status = get(f"/block/{block_hash}/status")
    if (final_tip < first_tip or final_hash != block_hash or
            not isinstance(final_status, dict) or final_status.get("in_best_chain") is not True):
        raise ValueError("secondary source chain changed during comparison")
    return {
        "schema_version": 1,
        "kind": "bounded_bitcoin_second_source_reconciliation",
        "retrieved_at": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
        "primary_source_id": sample["source_id"],
        "secondary_source_id": SECONDARY_SOURCE_ID,
        "pilot_artifact_sha256": source["sample_digest"],
        "block_height": height,
        "sampled_transactions_compared": len(sample["transactions"]),
        "secondary_confirmations_at_completion": final_tip - height + 1,
        "block_hash_and_header_agree": True,
        "sampled_positions_and_merkle_proofs_agree": True,
        "best_chain_checked_twice": True,
        "consensus_independently_validated": False,
        "full_history_coverage": False,
        "aml_scores_computed": 0,
        "caveat": "two public operators agree on a bounded sample; no local full-node consensus validation",
    }


def write_private(report, output_path):
    output_path = Path(output_path)
    output_path.parent.mkdir(parents=True, mode=0o700, exist_ok=True)
    os.chmod(output_path.parent, 0o700)
    payload = (json.dumps(report, sort_keys=True, separators=(",", ":")) + "\n").encode()
    descriptor, temporary_name = tempfile.mkstemp(prefix=".bitcoin-reconcile-", suffix=".tmp", dir=output_path.parent)
    temporary = Path(temporary_name)
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
    parser = argparse.ArgumentParser(description="Private, bounded Bitcoin second-source comparison")
    parser.add_argument("--pilot", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    report = reconcile(args.pilot)
    digest = write_private(report, args.output)
    print(json.dumps({"kind": report["kind"],
                      "sampled_transactions_compared": report["sampled_transactions_compared"],
                      "sources_agree": True, "report_sha256": digest}))


if __name__ == "__main__":
    main()
