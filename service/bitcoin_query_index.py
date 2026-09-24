"""Private queries over verified, bounded Bitcoin pilot observations.

An input outpoint is a reference, not an identified sender or spend-state query.
The index is a local research artifact and exposes no network service or scores.
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

from .bitcoin_pilot import ADDRESS
from .data_quality import inspect_bitcoin_pilot


HEX64 = re.compile(r"[0-9a-fA-F]{64}\Z")
MAX_RAW_BYTES = 8_000_000
MAX_PAGE_SIZE = 100
SCHEMA_VERSION = 1


def _hex64(value, name):
    if not isinstance(value, str) or HEX64.fullmatch(value) is None:
        raise ValueError(f"invalid {name}")
    return value.lower()


def _address(value):
    if not isinstance(value, str) or ADDRESS.fullmatch(value) is None:
        raise ValueError("invalid source-reported Bitcoin output address")
    return value


def build_index(pilot_path, index_path):
    """Validate a schema-v2 pilot and atomically replace its private SQLite index."""
    pilot_path, index_path = Path(pilot_path), Path(index_path)
    with pilot_path.open("rb") as handle:
        raw = handle.read(MAX_RAW_BYTES + 1)
    if len(raw) > MAX_RAW_BYTES:
        raise ValueError("Bitcoin pilot exceeds index byte bound")
    evidence = inspect_bitcoin_pilot(pilot_path)
    if hashlib.sha256(raw).hexdigest() != evidence["sample_digest"]:
        raise ValueError("Bitcoin pilot changed after validation")
    sample = json.loads(raw)
    if sample["schema_version"] not in (2, 3) or not evidence["merkle_inclusion_locally_verified"]:
        raise ValueError("Bitcoin query index requires verified schema-v2 or v3 pilot")
    if index_path.resolve() == pilot_path.resolve():
        raise ValueError("index path must differ from pilot path")

    index_path.parent.mkdir(parents=True, mode=0o700, exist_ok=True)
    os.chmod(index_path.parent, 0o700)
    fd, temporary_name = tempfile.mkstemp(prefix=".bitcoin-index-", suffix=".sqlite", dir=index_path.parent)
    os.close(fd)
    temporary = Path(temporary_name)
    os.chmod(temporary, 0o600)
    try:
        with closing(sqlite3.connect(temporary)) as db, db:
            db.executescript("""
                CREATE TABLE metadata (key TEXT PRIMARY KEY, value TEXT NOT NULL);
                CREATE TABLE observations (
                    id INTEGER PRIMARY KEY, kind TEXT NOT NULL, txid TEXT NOT NULL,
                    position INTEGER NOT NULL, output_address TEXT,
                    script_sha256 TEXT, scriptpubkey_hex TEXT, value_sat TEXT,
                    prior_txid TEXT, prior_vout INTEGER
                );
                CREATE INDEX observations_by_address ON observations(output_address, id);
                CREATE INDEX observations_by_script ON observations(script_sha256, id);
                CREATE INDEX observations_by_tx ON observations(txid, id);
            """)
            for tx in sample["transactions"]:
                txid = tx["txid"].lower()
                for position, output in enumerate(tx["outputs"]):
                    address = output.get("source_reported_address")
                    if address is not None:
                        address = _address(address)
                    script = output["scriptpubkey_hex"].lower()
                    db.execute("""INSERT INTO observations
                        (kind, txid, position, output_address, script_sha256,
                         scriptpubkey_hex, value_sat)
                         VALUES ('sampled_output', ?, ?, ?, ?, ?, ?)""", (
                        txid, position, address, hashlib.sha256(bytes.fromhex(script)).hexdigest(),
                        script, output["value_sat"],
                    ))
                for position, item in enumerate(tx["inputs"]):
                    if item["kind"] != "spent_outpoint_reference":
                        continue
                    prior = item["spent_outpoint"]
                    db.execute("""INSERT INTO observations
                        (kind, txid, position, prior_txid, prior_vout)
                        VALUES ('sampled_input_outpoint_reference', ?, ?, ?, ?)""", (
                        txid, position, prior["txid"].lower(), prior["vout"],
                    ))
            metadata = {
                "schema_version": SCHEMA_VERSION,
                "sample_sha256": evidence["sample_digest"],
                "source_id": evidence["source_id"],
                "retrieved_at": evidence["retrieved_at"],
                "block_hash": sample["block_hash"],
                "block_height": evidence["block_height"],
                "confirmations_source_reported_at_collection": evidence["confirmations_source_reported"],
                "sampled_transactions": evidence["sampled_transactions"],
                "sampled_outputs": evidence["sampled_outputs"],
                "sampled_input_outpoint_references": evidence["sampled_spent_outpoint_references"],
                "header_hash_locally_verified": True,
                "merkle_inclusion_locally_verified": True,
                "transaction_bodies_locally_verified_against_txids": evidence["transaction_bodies_locally_verified_against_txids"],
                "independent_node_reconciliation": False,
                "chain_history_complete": False,
                "sender_ownership_inferred": False,
                "unspent_status_queried": False,
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
        rows = db.execute("""SELECT id, kind, txid, position, output_address, script_sha256,
            scriptpubkey_hex, value_sat, prior_txid, prior_vout FROM observations WHERE """ + where +
            " AND id > ? ORDER BY id LIMIT ?", (*parameters, cursor, limit + 1)).fetchall()
    page = rows[:limit]
    columns = ("id", "kind", "txid", "position", "output_address", "script_sha256",
               "scriptpubkey_hex", "value_sat", "prior_txid", "prior_vout")
    return {
        "kind": "private_bounded_bitcoin_observation_query",
        "provenance": metadata,
        "observations": [dict(zip(columns, row)) for row in page],
        "next_cursor": page[-1][0] if len(rows) > limit else None,
        "semantics": "Sampled outputs and input outpoint references only; no sender, owner, unspent state, or AML conclusion is inferred.",
    }


def query_output_address(index_path, address, *, cursor=0, limit=50):
    return _query(index_path, "kind = 'sampled_output' AND output_address = ?",
                  (_address(address),), cursor=cursor, limit=limit)


def query_script_sha256(index_path, script_sha256, *, cursor=0, limit=50):
    return _query(index_path, "kind = 'sampled_output' AND script_sha256 = ?",
                  (_hex64(script_sha256, "script SHA-256"),), cursor=cursor, limit=limit)


def query_transaction(index_path, txid, *, cursor=0, limit=50):
    return _query(index_path, "txid = ?", (_hex64(txid, "Bitcoin transaction ID"),),
                  cursor=cursor, limit=limit)


def main():
    parser = argparse.ArgumentParser(description="Private Bitcoin sample index; queries output identifiers")
    actions = parser.add_subparsers(dest="action", required=True)
    build = actions.add_parser("build")
    build.add_argument("--pilot", type=Path, required=True)
    build.add_argument("--index", type=Path, required=True)
    address = actions.add_parser("address")
    address.add_argument("--index", type=Path, required=True)
    address.add_argument("--address", required=True)
    script = actions.add_parser("script")
    script.add_argument("--index", type=Path, required=True)
    script.add_argument("--script-sha256", required=True)
    transaction = actions.add_parser("transaction")
    transaction.add_argument("--index", type=Path, required=True)
    transaction.add_argument("--txid", required=True)
    for action in (address, script, transaction):
        action.add_argument("--cursor", type=int, default=0)
        action.add_argument("--limit", type=int, default=50)
    args = parser.parse_args()
    if args.action == "build":
        metadata = build_index(args.pilot, args.index)
        print(json.dumps({"kind": "private_bitcoin_query_index", "sample_sha256": metadata["sample_sha256"],
                          "sampled_outputs": metadata["sampled_outputs"],
                          "sampled_input_outpoint_references": metadata["sampled_input_outpoint_references"]}))
    else:
        method, value = {
            "address": (query_output_address, getattr(args, "address", None)),
            "script": (query_script_sha256, getattr(args, "script_sha256", None)),
            "transaction": (query_transaction, getattr(args, "txid", None)),
        }[args.action]
        print(json.dumps(method(args.index, value, cursor=args.cursor, limit=args.limit)))


if __name__ == "__main__":
    main()
