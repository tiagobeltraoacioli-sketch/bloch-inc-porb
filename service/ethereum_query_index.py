"""Private, read-only queries over one bounded Ethereum pilot artifact.

Addresses are protocol-level event participants, not people or beneficial owners.
The index is a local research artifact; it exposes no network service or scores.
"""

import argparse
import hashlib
import json
import os
import re
import sqlite3
import tempfile
from contextlib import closing
from pathlib import Path

from .data_quality import inspect_ethereum_pilot
from .ethereum import TOKEN_CONTRACTS


ADDRESS = re.compile(r"0x[0-9a-fA-F]{40}\Z")
TXID = re.compile(r"0x[0-9a-fA-F]{64}\Z")
ASSETS = {"eth": "eth", **{symbol: "erc20:" + contract for contract, symbol in TOKEN_CONTRACTS.items()}}
MAX_PAGE_SIZE = 100
MAX_RAW_BYTES = 32_000_000
SCHEMA_VERSION = 1


def _address(value):
    if not isinstance(value, str) or not ADDRESS.fullmatch(value):
        raise ValueError("invalid Ethereum address")
    return value.lower()


def _txid(value):
    if not isinstance(value, str) or not TXID.fullmatch(value):
        raise ValueError("invalid Ethereum transaction hash")
    return value.lower()


def _asset(value):
    if not isinstance(value, str) or value not in ASSETS:
        raise ValueError("asset must be eth, usdt, or usdc")
    return ASSETS[value]


def build_index(sample_dir, index_path):
    """Validate the pilot, then atomically replace its private SQLite index."""
    sample_dir, index_path = Path(sample_dir), Path(index_path)
    raw_path = sample_dir / "ethereum-pilot.jsonl"
    if raw_path.stat().st_size > MAX_RAW_BYTES:
        raise ValueError("Ethereum pilot exceeds index byte bound")
    evidence = inspect_ethereum_pilot(sample_dir)
    manifest = json.loads((sample_dir / "ethereum-pilot-manifest.json").read_text())
    if not 1 <= evidence["sampled_transactions"] <= 10:
        raise ValueError("Ethereum pilot exceeds transaction bound")
    raw = raw_path.read_bytes()
    if hashlib.sha256(raw).hexdigest() != evidence["sample_digest"]:
        raise ValueError("Ethereum pilot changed after validation")
    records = [json.loads(line) for line in raw.splitlines()]
    sampled = {row["tx_id"]: row for row in records if row["record_type"] == "sampled_transaction"}
    positions = [row["transaction_index"] for row in records if row["record_type"] == "sampled_transaction"]
    if positions != list(range(len(positions))) or len(positions) > manifest["block_transaction_count"]:
        raise ValueError("sampled transaction order does not match first block positions")
    movements = [row for row in records if row["record_type"] == "normalized_movement"]
    for row in movements:
        tx = sampled.get(row["tx_id"])
        if tx is None or tx["receipt_status"] != "0x1":
            raise ValueError("movement has no successful sampled receipt")
        if row["asset_id"] == "eth" and row["event_index"] != tx["transaction_index"]:
            raise ValueError("native event index differs from transaction index")
        if type(row["event_index"]) is not int or row["event_index"] < 0:
            raise ValueError("invalid event index")

    index_path.parent.mkdir(parents=True, mode=0o700, exist_ok=True)
    os.chmod(index_path.parent, 0o700)
    fd, temporary_name = tempfile.mkstemp(prefix=".ethereum-index-", suffix=".sqlite", dir=index_path.parent)
    os.close(fd)
    temporary = Path(temporary_name)
    os.chmod(temporary, 0o600)
    try:
        with closing(sqlite3.connect(temporary)) as db, db:
            db.executescript("""
                CREATE TABLE metadata (key TEXT PRIMARY KEY, value TEXT NOT NULL);
                CREATE TABLE movements (
                    id INTEGER PRIMARY KEY, event_key TEXT NOT NULL UNIQUE,
                    asset_id TEXT NOT NULL, tx_id TEXT NOT NULL, event_index INTEGER NOT NULL,
                    sender TEXT NOT NULL, destination TEXT NOT NULL,
                    amount_base_units TEXT NOT NULL, block_ref TEXT NOT NULL,
                    block_number INTEGER NOT NULL, source_line INTEGER NOT NULL
                );
                CREATE INDEX movements_by_sender ON movements(sender, asset_id, id);
                CREATE INDEX movements_by_destination ON movements(destination, asset_id, id);
                CREATE INDEX movements_by_tx ON movements(tx_id, id);
            """)
            for line_number, row in enumerate(records, 1):
                if row["record_type"] != "normalized_movement":
                    continue
                db.execute("""INSERT INTO movements
                    (event_key, asset_id, tx_id, event_index, sender, destination,
                     amount_base_units, block_ref, block_number, source_line)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""", (
                    row["event_key"], row["asset_id"], row["tx_id"], row["event_index"],
                    row["sender"], row["destination"], str(row["amount_base_units"]),
                    row["block_ref"], row["height_or_slot"], line_number,
                ))
            metadata = {
                "schema_version": SCHEMA_VERSION,
                "sample_sha256": evidence["sample_digest"],
                "source_id": evidence["source_id"],
                "source_host": evidence["source_host"],
                "retrieved_at": evidence["retrieved_at"],
                "source_reported_finalized_block_number": evidence["source_reported_finalized_block_number"],
                "source_reported_finalized_block_hash": manifest["source_reported_finalized_block_hash"],
                "source_reported_block_time": evidence["source_reported_block_time"],
                "sampled_transactions": evidence["sampled_transactions"],
                "movement_counts": evidence["movement_counts"],
                "chain_history_complete": False,
                "independent_finality_reconciled": False,
                "wallet_ownership_inferred": False,
                "aml_scores_computed": 0,
            }
            db.executemany("INSERT INTO metadata (key, value) VALUES (?, ?)",
                           ((key, json.dumps(value, separators=(",", ":"))) for key, value in metadata.items()))
        os.replace(temporary, index_path)
        return metadata
    finally:
        temporary.unlink(missing_ok=True)


def _query(index_path, where, parameters, *, cursor=0, limit=50):
    if type(cursor) is not int or cursor < 0 or type(limit) is not int or not 1 <= limit <= MAX_PAGE_SIZE:
        raise ValueError("invalid bounded pagination")
    with closing(sqlite3.connect(Path(index_path).resolve().as_uri() + "?mode=ro", uri=True)) as db:
        metadata = {key: json.loads(value) for key, value in db.execute("SELECT key, value FROM metadata")}
        if metadata.get("schema_version") != SCHEMA_VERSION:
            raise ValueError("unsupported index schema")
        rows = db.execute("""SELECT id, event_key, asset_id, tx_id, event_index, sender,
            destination, amount_base_units, block_ref, block_number, source_line
            FROM movements WHERE """ + where + " AND id > ? ORDER BY id LIMIT ?",
            (*parameters, cursor, limit + 1)).fetchall()
    page = rows[:limit]
    columns = ("id", "event_key", "asset_id", "tx_id", "event_index", "sender", "destination",
               "amount_base_units", "block_ref", "block_number", "source_line")
    return {
        "kind": "private_bounded_ethereum_movement_query",
        "provenance": metadata,
        "movements": [dict(zip(columns, row)) for row in page],
        "next_cursor": page[-1][0] if len(rows) > limit else None,
        "semantics": "Protocol event participants only; no person, beneficial owner, or AML conclusion is inferred.",
    }


def query_address(index_path, address, *, asset, direction="either", cursor=0, limit=50):
    address, asset_id = _address(address), _asset(asset)
    if direction not in ("incoming", "outgoing", "either"):
        raise ValueError("direction must be incoming, outgoing, or either")
    field = {"incoming": "destination", "outgoing": "sender"}.get(direction)
    where = f"asset_id = ? AND {field} = ?" if field else "asset_id = ? AND (sender = ? OR destination = ?)"
    parameters = (asset_id, address) if field else (asset_id, address, address)
    result = _query(index_path, where, parameters, cursor=cursor, limit=limit)
    result["direction"] = direction
    return result


def query_transaction(index_path, txid, *, cursor=0, limit=50):
    return _query(index_path, "tx_id = ?", (_txid(txid),), cursor=cursor, limit=limit)


def main():
    parser = argparse.ArgumentParser(description="Private Ethereum sample index; output contains identifiers")
    actions = parser.add_subparsers(dest="action", required=True)
    build = actions.add_parser("build")
    build.add_argument("--sample-dir", type=Path, required=True)
    build.add_argument("--index", type=Path, required=True)
    address = actions.add_parser("address")
    address.add_argument("--index", type=Path, required=True)
    address.add_argument("--address", required=True)
    address.add_argument("--asset", choices=tuple(ASSETS), required=True)
    address.add_argument("--direction", choices=("incoming", "outgoing", "either"), default="either")
    transaction = actions.add_parser("transaction")
    transaction.add_argument("--index", type=Path, required=True)
    transaction.add_argument("--txid", required=True)
    for action in (address, transaction):
        action.add_argument("--cursor", type=int, default=0)
        action.add_argument("--limit", type=int, default=50)
    args = parser.parse_args()
    if args.action == "build":
        metadata = build_index(args.sample_dir, args.index)
        print(json.dumps({"kind": "private_ethereum_query_index", "sample_sha256": metadata["sample_sha256"],
                          "movement_counts": metadata["movement_counts"]}))
    elif args.action == "address":
        print(json.dumps(query_address(args.index, args.address, asset=args.asset,
                                       direction=args.direction, cursor=args.cursor, limit=args.limit)))
    else:
        print(json.dumps(query_transaction(args.index, args.txid, cursor=args.cursor, limit=args.limit)))


if __name__ == "__main__":
    main()
