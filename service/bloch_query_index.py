"""Private, immutable SQLite query index for a bounded Bloch research sample.

An input is a spent-outpoint observation, never evidence of a wallet sender.
The index is local to the data host and has no HTTP endpoint.
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


HEX64 = re.compile(r"[0-9a-fA-F]{64}\Z")
SAT = re.compile(r"[0-9]{1,39}\Z")
MAX_PAGE_SIZE = 100
SCHEMA_VERSION = 1


def _hex(value, name):
    if not isinstance(value, str) or not HEX64.fullmatch(value):
        raise ValueError(f"invalid {name}")
    return value.lower()


def _nonnegative(value, name):
    if type(value) is not int or value < 0:
        raise ValueError(f"invalid {name}")
    return value


def _amount(value):
    if not isinstance(value, str) or not SAT.fullmatch(value):
        raise ValueError("invalid exact base-unit amount")
    return value


def _observation(row, manifest, line_number):
    if row.get("source_id") != manifest["source_id"] or row.get("sender_ownership_asserted") is not False:
        raise ValueError("source or attribution boundary mismatch")
    kind = row.get("record_type")
    if kind == "created_output_observation":
        if (row.get("chain"), row.get("network"), row.get("asset_id"), row.get("finality")) != (
            "bloch", "genesis4-mainnet", "blch", "finalized"
        ):
            raise ValueError("unexpected created-output chain or finality")
        txid = _hex(row.get("tx_id"), "created transaction ID")
        vout = _nonnegative(row.get("event_index"), "output index")
        block_ref = _hex(row.get("block_ref"), "created block reference")
        slot = _nonnegative(row.get("slot"), "created slot")
        height = None
        input_index = None
    elif kind == "spent_outpoint_observation":
        txid = _hex(row.get("spending_tx_id"), "spending transaction ID")
        vout = _nonnegative(row.get("prior_vout"), "prior output index")
        block_ref = _hex(row.get("block_id"), "spending block reference")
        slot = _nonnegative(row.get("slot"), "spending slot")
        height = _nonnegative(row.get("height"), "spending height")
        input_index = _nonnegative(row.get("input_index"), "input index")
        if height > manifest["reported_finalized_height"]:
            raise ValueError("input exceeds source-reported finalized height")
    else:
        raise ValueError("unsupported sample record type")
    out_txid = txid if kind == "created_output_observation" else _hex(row.get("prior_tx_id"), "prior transaction ID")
    script_hash = _hex(row.get("script_hash") if kind == "created_output_observation" else row.get("prior_script_hash"), "script hash")
    amount = _amount(row.get("value_sat"))
    return (kind, txid, out_txid, vout, script_hash, amount, block_ref, height, slot,
            input_index, line_number, json.dumps(row, sort_keys=True, separators=(",", ":")))


def build_index(sample_dir, index_path):
    """Verify the original bytes, then atomically replace a private query index."""
    sample_dir, index_path = Path(sample_dir), Path(index_path)
    manifest = json.loads((sample_dir / "bloch-sample-manifest.json").read_text())
    if manifest.get("status") != "bounded_private_research_sample" or manifest.get("source_id") != "bloch-historical-indexer":
        raise ValueError("unexpected sample provenance")
    for name in ("record_count", "created_outputs", "spent_outpoint_observations", "finalized_transactions",
                 "reported_finalized_height", "snapshot_height", "snapshot_slot"):
        _nonnegative(manifest.get(name), name)
    if type(manifest.get("source_complete")) is not bool or not isinstance(manifest.get("retrieved_at"), str):
        raise ValueError("invalid sample provenance metadata")
    digest = _hex(manifest.get("records_sha256"), "sample digest")
    raw = (sample_dir / "bloch-sample.jsonl").read_bytes()
    if hashlib.sha256(raw).hexdigest() != digest:
        raise ValueError("sample digest does not match manifest")
    lines = raw.splitlines()
    if len(lines) != manifest["record_count"]:
        raise ValueError("sample record count mismatch")

    index_path.parent.mkdir(parents=True, mode=0o700, exist_ok=True)
    os.chmod(index_path.parent, 0o700)
    fd, temporary_name = tempfile.mkstemp(prefix=".bloch-index-", suffix=".sqlite", dir=index_path.parent)
    os.close(fd)
    temporary = Path(temporary_name)
    os.chmod(temporary, 0o600)
    try:
        with closing(sqlite3.connect(temporary)) as db, db:
            db.executescript("""
                CREATE TABLE metadata (key TEXT PRIMARY KEY, value TEXT NOT NULL);
                CREATE TABLE observations (
                    id INTEGER PRIMARY KEY, kind TEXT NOT NULL, txid TEXT NOT NULL,
                    out_txid TEXT NOT NULL, vout INTEGER NOT NULL, script_hash TEXT NOT NULL,
                    value_sat TEXT NOT NULL, block_ref TEXT NOT NULL, height INTEGER,
                    slot INTEGER NOT NULL, input_index INTEGER, source_line INTEGER NOT NULL,
                    record_json TEXT NOT NULL
                );
                CREATE INDEX observations_by_script ON observations(script_hash, id);
                CREATE INDEX observations_by_outpoint ON observations(out_txid, vout, id);
            """)
            counts = {"created_output_observation": 0, "spent_outpoint_observation": 0}
            created = set()
            observed_transactions = set()
            for number, line in enumerate(lines, 1):
                row = json.loads(line)
                record = _observation(row, manifest, number)
                observed_transactions.add(record[1])
                if record[0] == "created_output_observation":
                    key = (record[2], record[3])
                    if key in created:
                        raise ValueError("duplicate created outpoint")
                    created.add(key)
                counts[record[0]] += 1
                db.execute("INSERT INTO observations (kind, txid, out_txid, vout, script_hash, value_sat, block_ref, height, slot, input_index, source_line, record_json) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)", record)
            if (counts["created_output_observation"] != manifest["created_outputs"] or
                    counts["spent_outpoint_observation"] != manifest["spent_outpoint_observations"]):
                raise ValueError("sample observation counts do not match manifest")
            if len(observed_transactions) > manifest["finalized_transactions"]:
                raise ValueError("observed transaction count exceeds sample manifest")
            metadata = {
                "schema_version": SCHEMA_VERSION,
                "sample_sha256": digest,
                "source_id": manifest["source_id"],
                "source_retrieved_at": manifest.get("retrieved_at"),
                "snapshot_height": manifest.get("snapshot_height"),
                "snapshot_slot": manifest.get("snapshot_slot"),
                "reported_finalized_height": manifest["reported_finalized_height"],
                "source_complete": bool(manifest.get("source_complete")),
                "record_count": len(lines),
                "created_outputs": counts["created_output_observation"],
                "spent_outpoint_observations": counts["spent_outpoint_observation"],
                "chain_history_complete": False,
                "wallet_ownership_inferred": False,
                "aml_scores_computed": 0,
            }
            db.executemany("INSERT INTO metadata (key, value) VALUES (?, ?)",
                           ((key, json.dumps(value, separators=(",", ":"))) for key, value in metadata.items()))
        os.replace(temporary, index_path)
        return metadata
    finally:
        temporary.unlink(missing_ok=True)


def _read_only(path):
    return sqlite3.connect(Path(path).resolve().as_uri() + "?mode=ro", uri=True)


def _query(index_path, where, parameters, *, cursor=0, limit=50, outpoint=None):
    if type(cursor) is not int or cursor < 0 or type(limit) is not int or not 1 <= limit <= MAX_PAGE_SIZE:
        raise ValueError("invalid bounded pagination")
    with closing(_read_only(index_path)) as db:
        metadata = {key: json.loads(value) for key, value in db.execute("SELECT key, value FROM metadata")}
        if metadata.get("schema_version") != SCHEMA_VERSION:
            raise ValueError("unsupported index schema")
        rows = db.execute(
            "SELECT id, kind, txid, out_txid, vout, script_hash, value_sat, block_ref, height, slot, input_index, source_line "
            f"FROM observations WHERE {where} AND id > ? ORDER BY id LIMIT ?",
            (*parameters, cursor, limit + 1),
        ).fetchall()
        evidence = _outpoint_evidence(db, *outpoint) if outpoint is not None else None
    has_more = len(rows) > limit
    page = rows[:limit]
    columns = ("id", "record_type", "observed_tx_id", "outpoint_tx_id", "outpoint_vout", "script_hash",
               "value_sat", "block_ref", "height", "slot", "input_index", "source_line")
    observations = [dict(zip(columns, row)) for row in page]
    result = {
        "kind": "private_bounded_bloch_observation_query",
        "provenance": metadata,
        "observations": observations,
        "next_cursor": page[-1][0] if has_more else None,
        "semantics": "Created outputs and spent-outpoint references are separate observations; no sender or person-level ownership is inferred.",
    }
    if evidence is not None:
        result["outpoint_evidence"] = evidence
    return result


def _outpoint_evidence(db, txid, vout):
    """Summarize every observation for one exact outpoint, independent of page size."""
    creation = db.execute(
        "SELECT script_hash, value_sat, slot, source_line FROM observations "
        "WHERE out_txid = ? AND vout = ? AND kind = 'created_output_observation'",
        (txid, vout),
    ).fetchone()
    counts = db.execute(
        "SELECT COUNT(*), "
        "COALESCE(SUM(CASE WHEN script_hash != ? OR value_sat != ? THEN 1 ELSE 0 END), 0), "
        "COALESCE(SUM(CASE WHEN slot < ? THEN 1 ELSE 0 END), 0) "
        "FROM observations WHERE out_txid = ? AND vout = ? "
        "AND kind = 'spent_outpoint_observation'",
        (creation[0] if creation else "", creation[1] if creation else "",
         creation[2] if creation else 0, txid, vout),
    ).fetchone()
    spends, mismatches, preceding_spends = counts
    if creation is None:
        status = "spend_only_creation_not_in_sample" if spends else "outpoint_not_observed"
        mismatches = preceding_spends = None
    elif mismatches or preceding_spends:
        status = "conflicting_observations"
    elif spends > 1:
        status = "multiple_spend_observations"
    elif spends == 1:
        status = "consistent_creation_and_spend_observations"
    else:
        status = "creation_only_spend_not_in_sample"
    return {
        "status": status,
        "created_observation_count": int(creation is not None),
        "spent_observation_count": spends,
        "script_or_amount_mismatch_count": mismatches,
        "spend_precedes_creation_slot_count": preceding_spends,
        "created_source_line": creation[3] if creation else None,
        "scope": "exact_outpoint_within_bounded_sample",
        "source_finality_independently_verified": False,
        "sender_ownership_inferred": False,
    }


def query_script(index_path, script_hash, *, cursor=0, limit=50):
    return _query(index_path, "script_hash = ?", (_hex(script_hash, "script hash"),), cursor=cursor, limit=limit)


def query_outpoint(index_path, txid, vout, *, cursor=0, limit=50):
    txid = _hex(txid, "outpoint transaction ID")
    vout = _nonnegative(vout, "outpoint index")
    result = _query(index_path, "out_txid = ? AND vout = ?", (txid, vout), cursor=cursor, limit=limit,
                    outpoint=(txid, vout))
    result["linkage"] = "within_sample_candidate_only"
    return result


def main():
    parser = argparse.ArgumentParser(description="Private Bloch sample index; output contains identifiers")
    actions = parser.add_subparsers(dest="action", required=True)
    build = actions.add_parser("build")
    build.add_argument("--sample-dir", type=Path, required=True)
    build.add_argument("--index", type=Path, required=True)
    script = actions.add_parser("script")
    script.add_argument("--index", type=Path, required=True)
    script.add_argument("--hash", required=True)
    outpoint = actions.add_parser("outpoint")
    outpoint.add_argument("--index", type=Path, required=True)
    outpoint.add_argument("--txid", required=True)
    outpoint.add_argument("--vout", type=int, required=True)
    for action in (script, outpoint):
        action.add_argument("--cursor", type=int, default=0)
        action.add_argument("--limit", type=int, default=50)
    args = parser.parse_args()
    if args.action == "build":
        metadata = build_index(args.sample_dir, args.index)
        print(json.dumps({"kind": "private_bloch_query_index", "record_count": metadata["record_count"],
                          "sample_sha256": metadata["sample_sha256"]}))
    elif args.action == "script":
        print(json.dumps(query_script(args.index, args.hash, cursor=args.cursor, limit=args.limit)))
    else:
        print(json.dumps(query_outpoint(args.index, args.txid, args.vout, cursor=args.cursor, limit=args.limit)))


if __name__ == "__main__":
    main()
