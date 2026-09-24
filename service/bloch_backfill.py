"""Bounded private Bloch eUTXO sample with snapshot-pinned cursor pagination.

Outputs and input outpoint references are observations, not wallet ownership.
"""

import argparse
import hashlib
import json
import os
import re
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import quote

from .bloch import get_json, normalized_outputs

HEX64 = re.compile(r"[a-fA-F0-9]{64}")
SAT = re.compile(r"[0-9]{1,39}")
MAX_CHECKPOINT_MANIFEST_BYTES = 1_000_000
MAX_CHECKPOINT_RECORDS_BYTES = 100_000_000


def _tx_fingerprint(txid, block_id):
    return hashlib.sha256((txid.lower() + ":" + block_id.lower()).encode()).hexdigest()


def load_checkpoint(sample_dir):
    """Verify a completed private partial sample before using its cursor."""
    sample_dir = Path(sample_dir)
    manifest_path = sample_dir / "bloch-sample-manifest.json"
    records_path = sample_dir / "bloch-sample.jsonl"
    if (manifest_path.stat().st_size > MAX_CHECKPOINT_MANIFEST_BYTES
            or records_path.stat().st_size > MAX_CHECKPOINT_RECORDS_BYTES):
        raise ValueError("Bloch checkpoint artifact exceeds bound")
    manifest = json.loads(manifest_path.read_bytes())
    raw = records_path.read_bytes()
    if (manifest.get("checkpoint_version") != 1
            or manifest.get("status") != "bounded_private_research_sample"
            or manifest.get("source_id") != "bloch-historical-indexer"
            or manifest.get("records_sha256") != hashlib.sha256(raw).hexdigest()
            or manifest.get("record_count") != len(raw.splitlines())
            or manifest.get("wallet_ownership_inferred") is not False
            or type(manifest.get("aml_scores_computed")) is not int
            or manifest["aml_scores_computed"] != 0
            or manifest.get("source_complete") is not False
            or not isinstance(manifest.get("next_cursor"), str)
            or not re.fullmatch(r"[0-9]+-[a-fA-F0-9]{64}-[0-9]+", manifest["next_cursor"])):
        raise ValueError("invalid or complete Bloch checkpoint")
    pages = manifest.get("pages")
    fingerprints = manifest.get("seen_transaction_fingerprints")
    cursors = manifest.get("seen_cursors")
    page_limits = manifest.get("page_limits_used")
    if (type(pages) is not int or not 1 <= pages < 20
            or type(manifest.get("snapshot_height")) is not int
            or manifest["snapshot_height"] < 0
            or type(manifest.get("snapshot_slot")) is not int
            or manifest["snapshot_slot"] < 0
            or type(manifest.get("reported_finalized_height")) is not int
            or manifest["reported_finalized_height"] < 0
            or type(manifest.get("finalized_transactions")) is not int
            or manifest["finalized_transactions"] < 0
            or type(manifest.get("created_outputs")) is not int
            or manifest["created_outputs"] < 0
            or type(manifest.get("spent_outpoint_observations")) is not int
            or manifest["spent_outpoint_observations"] < 0
            or type(manifest.get("response_bound_retries")) is not int
            or manifest["response_bound_retries"] < 0
            or not isinstance(page_limits, list) or len(page_limits) != pages
            or any(type(value) is not int or not 1 <= value <= 100 for value in page_limits)
            or not isinstance(fingerprints, list)
            or len(fingerprints) != manifest["finalized_transactions"]
            or any(not isinstance(item, str) or not HEX64.fullmatch(item) for item in fingerprints)
            or len(set(fingerprints)) != len(fingerprints)
            or not isinstance(cursors, list) or len(cursors) != pages
            or len(set(cursors)) != len(cursors)
            or cursors[-1] != manifest["next_cursor"]
            or any(not isinstance(item, str)
                   or not re.fullmatch(r"[0-9]+-[a-fA-F0-9]{64}-[0-9]+", item)
                   for item in cursors)):
        raise ValueError("invalid Bloch checkpoint state")
    records = [json.loads(line) for line in raw.splitlines()]
    from .data_quality import inspect_bloch_sample
    evidence = inspect_bloch_sample(sample_dir)
    if (evidence["finalized_transactions"] != manifest["finalized_transactions"]
            or evidence["created_outputs"] != manifest["created_outputs"]
            or evidence["spent_outpoint_observations"] != manifest["spent_outpoint_observations"]
            or evidence["quality_gate"] != "pass"):
        raise ValueError("Bloch checkpoint evidence mismatch")
    return manifest, records


def input_observations(tx):
    if not isinstance(tx.get("inputs"), list):
        raise ValueError("transaction inputs missing")
    rows = []
    for index, item in enumerate(tx["inputs"]):
        if not all(HEX64.fullmatch(item.get(name, "")) for name in ("txid", "script_hash")):
            raise ValueError("invalid input outpoint")
        if not isinstance(item.get("vout"), int) or item["vout"] < 0 or not SAT.fullmatch(item.get("value_sat", "")):
            raise ValueError("invalid input amount or index")
        rows.append({
            "record_type": "spent_outpoint_observation",
            "spending_tx_id": tx["txid"].lower(),
            "input_index": index,
            "prior_tx_id": item["txid"].lower(),
            "prior_vout": item["vout"],
            "prior_script_hash": item["script_hash"].lower(),
            "value_sat": item["value_sat"],
            "block_id": tx["block_id"].lower(),
            "height": tx["height"], "slot": tx["slot"],
            "source_id": "bloch-historical-indexer",
            "sender_ownership_asserted": False,
        })
    return rows


def collect(*, pages=5, page_size=100, fetch=get_json, resume_dir=None):
    if not (1 <= pages <= 20 and 1 <= page_size <= 100):
        raise ValueError("bounded pages and page size required")
    health = fetch("/health")
    finalized_height = health.get("finalized_height")
    if health.get("ok") is not True or not isinstance(finalized_height, int):
        raise ValueError("source finality unavailable")
    previous = None
    if resume_dir is not None:
        previous, records = load_checkpoint(resume_dir)
        if pages <= previous["pages"]:
            raise ValueError("target page count must exceed checkpoint pages")
        if finalized_height < previous["reported_finalized_height"]:
            raise ValueError("source-reported finalized height regressed")
        finalized_height = previous["reported_finalized_height"]
        cursor = previous["next_cursor"]
        seen_cursors = set(previous["seen_cursors"])
        cursor_history = list(previous["seen_cursors"])
        seen_txs = set(previous["seen_transaction_fingerprints"])
        seen_outputs = {row["event_key"] for row in records
                        if row["record_type"] == "created_output_observation"}
        snapshot_height, snapshot_slot = previous["snapshot_height"], previous["snapshot_slot"]
        page_count = previous["pages"]
        tx_count = previous["finalized_transactions"]
        output_count = previous["created_outputs"]
        input_count = previous["spent_outpoint_observations"]
        response_bound_retries = previous["response_bound_retries"]
        page_limits_used = list(previous["page_limits_used"])
    else:
        cursor = None
        seen_cursors, seen_txs, seen_outputs = set(), set(), set()
        cursor_history = []
        snapshot_height = snapshot_slot = None
        records = []
        page_count = tx_count = output_count = input_count = 0
        response_bound_retries = 0
        page_limits_used = []
    for _ in range(pages - page_count):
        request_limit = page_size
        while True:
            suffix = f"/transactions?limit={request_limit}"
            if cursor:
                suffix += "&cursor=" + quote(cursor, safe="")
            try:
                page = fetch(suffix)
                break
            except ValueError as error:
                if str(error) != "indexer response exceeds bound" or request_limit == 1:
                    raise
                request_limit = max(1, request_limit // 2)
                response_bound_retries += 1
        page_limits_used.append(request_limit)
        if not isinstance(page.get("transactions"), list) or not isinstance(page.get("as_of_height"), int) or not isinstance(page.get("as_of_slot"), int):
            raise ValueError("invalid indexer page")
        if snapshot_height is None:
            snapshot_height, snapshot_slot = page["as_of_height"], page["as_of_slot"]
        elif page["as_of_height"] != snapshot_height or page["as_of_slot"] != snapshot_slot:
            raise ValueError("indexer snapshot changed during pagination")
        page_count += 1
        for tx in page["transactions"]:
            txid = tx.get("txid", "")
            if not HEX64.fullmatch(txid) or not HEX64.fullmatch(tx.get("block_id", "")):
                raise ValueError("invalid transaction identity")
            if not isinstance(tx.get("height"), int) or not isinstance(tx.get("slot"), int):
                raise ValueError("invalid transaction position")
            if tx["height"] > finalized_height:
                continue
            identity = _tx_fingerprint(txid, tx["block_id"])
            if identity in seen_txs:
                raise ValueError("duplicate transaction across pages")
            seen_txs.add(identity)
            tx_count += 1
            for movement in normalized_outputs(tx, finalized_height):
                if movement.key in seen_outputs:
                    raise ValueError("duplicate normalized output")
                seen_outputs.add(movement.key)
                records.append({
                    "record_type": "created_output_observation",
                    "event_key": movement.key,
                    "chain": movement.chain, "network": movement.network, "asset_id": movement.asset_id,
                    "tx_id": movement.tx_id, "event_index": movement.event_index,
                    "block_ref": movement.block_ref, "slot": movement.height_or_slot,
                    "finality": movement.finality, "value_sat": str(movement.amount_base_units),
                    "script_hash": movement.destination, "source_id": movement.source_id,
                    "sender_ownership_asserted": False,
                })
                output_count += 1
            inputs = input_observations(tx)
            records.extend(inputs)
            input_count += len(inputs)
        next_cursor = page.get("next_cursor")
        if next_cursor is None:
            cursor = None
            break
        if not isinstance(next_cursor, str) or not re.fullmatch(r"[0-9]+-[a-fA-F0-9]{64}-[0-9]+", next_cursor) or next_cursor in seen_cursors:
            raise ValueError("invalid or repeated cursor")
        seen_cursors.add(next_cursor)
        cursor_history.append(next_cursor)
        cursor = next_cursor
    manifest = {
        "status": "bounded_private_research_sample",
        "source_id": "bloch-historical-indexer",
        "retrieved_at": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
        "snapshot_height": snapshot_height, "snapshot_slot": snapshot_slot,
        "reported_finalized_height": finalized_height,
        "pages": page_count, "finalized_transactions": tx_count,
        "created_outputs": output_count, "spent_outpoint_observations": input_count,
        "response_bound_retries": response_bound_retries,
        "page_limits_used": page_limits_used,
        "checkpoint_version": 1,
        "seen_transaction_fingerprints": sorted(seen_txs),
        "seen_cursors": cursor_history,
        "next_cursor": cursor,
        "source_complete": cursor is None,
        "wallet_ownership_inferred": False,
        "aml_scores_computed": 0,
    }
    return manifest, records


def write_private(manifest, records, output_dir):
    output_dir = Path(output_dir)
    output_dir.mkdir(mode=0o700, parents=True, exist_ok=True)
    os.chmod(output_dir, 0o700)
    payload = "".join(json.dumps(item, sort_keys=True, separators=(",", ":")) + "\n" for item in records).encode()
    manifest = dict(manifest, records_sha256=hashlib.sha256(payload).hexdigest(), record_count=len(records))
    for name, content in (("bloch-sample.jsonl", payload), ("bloch-sample-manifest.json", (json.dumps(manifest, sort_keys=True, indent=2) + "\n").encode())):
        path = output_dir / name
        temporary = output_dir / (name + ".tmp")
        descriptor = os.open(temporary, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
        os.fchmod(descriptor, 0o600)
        with os.fdopen(descriptor, "wb") as handle:
            handle.write(content)
            handle.flush()
            os.fsync(handle.fileno())
        os.replace(temporary, path)
    return manifest


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--pages", type=int, default=5)
    parser.add_argument("--page-size", type=int, default=100)
    parser.add_argument("--resume-dir", type=Path,
                        help="verified partial sample; output directory must be different")
    parser.add_argument("--output-dir", type=Path, required=True)
    args = parser.parse_args()
    if args.resume_dir is not None and args.resume_dir.resolve() == args.output_dir.resolve():
        parser.error("resume and output directories must differ")
    manifest, records = collect(pages=args.pages, page_size=args.page_size,
                                resume_dir=args.resume_dir)
    manifest = write_private(manifest, records, args.output_dir)
    print(json.dumps({key: manifest[key] for key in ("status", "pages", "finalized_transactions", "created_outputs", "spent_outpoint_observations", "record_count", "source_complete")}))


if __name__ == "__main__":
    main()
