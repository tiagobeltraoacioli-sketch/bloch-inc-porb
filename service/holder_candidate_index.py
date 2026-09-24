"""Private index of source-reported address balances from bounded Graphus lookups.

This is a candidate registry, not a chain-wide holder ranking. BTC observations
have different retrieval times; Ethereum rows are queried per block hash.
"""

import argparse
import hashlib
import json
import os
import re
import sqlite3
import tempfile
from contextlib import closing
from datetime import datetime
from pathlib import Path

from .ethereum import TOKEN_CONTRACTS


MAX_INPUT_BYTES = 16_000_000
MAX_LOOKUPS = 10_000
MAX_RESULTS = 100
ETH_ADDRESS = re.compile(r"0x[0-9a-fA-F]{40}\Z")
BTC_ADDRESS = re.compile(r"(?:bc1[ac-hj-np-z02-9]{11,87}|[13][a-km-zA-HJ-NP-Z1-9]{25,34})\Z", re.I)
HEX64 = re.compile(r"0x[0-9a-fA-F]{64}\Z")
DECIMAL = re.compile(r"(?:0|[1-9][0-9]*)\Z")
CONTRACT_BY_ASSET = {symbol.upper(): contract for contract, symbol in TOKEN_CONTRACTS.items()}
ASSET_NETWORK = {"BTC": "bitcoin-mainnet", "ETH": "ethereum-mainnet",
                 "USDT": "ethereum-mainnet", "USDC": "ethereum-mainnet"}


def _timestamp(value):
    if not isinstance(value, str) or not value.endswith("Z"):
        raise ValueError("UTC retrieval timestamp required")
    try:
        parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError as error:
        raise ValueError("invalid retrieval timestamp") from error
    if parsed.utcoffset().total_seconds() != 0:
        raise ValueError("UTC retrieval timestamp required")
    return parsed.isoformat(timespec="microseconds").replace("+00:00", "Z")


def _balance(balance, asset):
    if not isinstance(balance, dict) or not isinstance(balance.get("base_units"), str):
        raise ValueError("source-reported balance required")
    amount = balance["base_units"]
    if not DECIMAL.fullmatch(amount) or len(amount) > 78:
        raise ValueError("invalid exact base-unit amount")
    if asset == "BTC":
        if balance.get("unit") != "sat" or balance.get("scope") != "source_confirmed_address_aggregate" or balance.get("block") is not None:
            raise ValueError("invalid BTC address aggregate")
        return amount, None, None, None
    expected_unit = "wei" if asset == "ETH" else "token-base-unit"
    if balance.get("unit") != expected_unit or balance.get("scope") != "source_reported_finalized_block":
        raise ValueError("invalid Ethereum balance scope")
    if asset in CONTRACT_BY_ASSET and (str(balance.get("contract", "")).lower() != CONTRACT_BY_ASSET[asset]
                                   or balance.get("decimals") != 6):
        raise ValueError("unexpected allowlisted ERC-20 contract")
    block = balance.get("block")
    if (not isinstance(block, dict) or type(block.get("height")) is not int or block["height"] < 0
            or not isinstance(block.get("hash"), str) or not HEX64.fullmatch(block["hash"])):
        raise ValueError("source-reported finalized block required")
    return amount, block["hash"].lower(), block["height"], block.get("time")


def _extract(record):
    if not isinstance(record, dict) or record.get("status") != "source-reported" or record.get("independent_verification") is not False:
        raise ValueError("only source-reported Graphus responses are accepted")
    asset = record.get("asset")
    if asset not in ASSET_NETWORK or record.get("network") != ASSET_NETWORK[asset]:
        raise ValueError("unsupported network or asset")
    address = record.get("address")
    pattern = BTC_ADDRESS if asset == "BTC" else ETH_ADDRESS
    if not isinstance(address, str) or not pattern.fullmatch(address):
        raise ValueError("invalid address identifier")
    if asset != "BTC":
        address = address.lower()
    elif address.lower().startswith("bc1") and address not in (address.lower(), address.upper()):
        raise ValueError("mixed-case Bitcoin witness address")
    observation = record.get("observation")
    if not isinstance(observation, dict):
        raise ValueError("source observation required")
    source_id = observation.get("source_id")
    if source_id != ("blockstream-esplora" if asset == "BTC" else "configured-ethereum-json-rpc"):
        raise ValueError("unexpected source identifier")
    retrieved = _timestamp(observation.get("retrieved_at"))
    amount, block_hash, block_height, block_time = _balance(record.get("balance"), asset)
    if asset == "BTC":
        if observation.get("coverage") not in ("unavailable", "first_page_up_to_8_confirmed_transactions"):
            raise ValueError("unexpected BTC query coverage")
    elif observation.get("coverage") != "single_address_balance_at_source_reported_finalized_block":
        raise ValueError("unexpected Ethereum query coverage")
    return [(asset, address, amount, source_id, retrieved, block_hash, block_height, block_time,
             "queried_address")]


def build_index(input_jsonl, index_path):
    """Build an atomic, bounded SQLite snapshot from saved public lookup responses."""
    input_jsonl, index_path = Path(input_jsonl), Path(index_path)
    if input_jsonl.stat().st_size > MAX_INPUT_BYTES:
        raise ValueError("input exceeds byte bound")
    raw = input_jsonl.read_bytes()
    lines = raw.splitlines()
    if not 1 <= len(lines) <= MAX_LOOKUPS:
        raise ValueError("input lookup count outside bound")
    rows = {}
    block_anchors = {}
    for line in lines:
        for row in _extract(json.loads(line)):
            if row[5]:
                anchor = (row[6], row[7])
                if row[5] in block_anchors and block_anchors[row[5]] != anchor:
                    raise ValueError("inconsistent Ethereum block anchor")
                block_anchors[row[5]] = anchor
            key = row[0], row[1], row[5]
            if key not in rows or row[4] > rows[key][4]:
                rows[key] = row
    index_path.parent.mkdir(parents=True, mode=0o700, exist_ok=True)
    os.chmod(index_path.parent, 0o700)
    descriptor, temporary_name = tempfile.mkstemp(prefix=".holders-", suffix=".sqlite", dir=index_path.parent)
    os.close(descriptor)
    temporary = Path(temporary_name)
    os.chmod(temporary, 0o600)
    try:
        with closing(sqlite3.connect(temporary)) as db, db:
            db.executescript("""
                CREATE TABLE metadata (key TEXT PRIMARY KEY, value TEXT NOT NULL);
                CREATE TABLE balances (
                    asset TEXT NOT NULL, address TEXT NOT NULL,
                    amount_base_units TEXT NOT NULL, source_id TEXT NOT NULL,
                    retrieved_at TEXT NOT NULL, block_hash TEXT NOT NULL,
                    block_height INTEGER, block_time TEXT, selection TEXT NOT NULL,
                    PRIMARY KEY (asset, address, block_hash)
                );
                CREATE INDEX balances_rank ON balances(asset, block_hash, length(amount_base_units) DESC, amount_base_units DESC);
            """)
            db.executemany("INSERT INTO balances VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
                           ((asset, address, amount, source, retrieved, block_hash or "", height, time, selection)
                            for asset, address, amount, source, retrieved, block_hash, height, time, selection in rows.values()))
            metadata = {"schema_version": 1, "input_sha256": hashlib.sha256(raw).hexdigest(),
                        "lookup_count": len(lines), "candidate_count": len(rows),
                        "chain_history_complete": False, "network_wide_discovery_complete": False,
                        "independent_balance_verification": False, "ownership_attribution": False}
            db.executemany("INSERT INTO metadata VALUES (?, ?)",
                           ((key, json.dumps(value, separators=(",", ":"))) for key, value in metadata.items()))
        os.replace(temporary, index_path)
        return metadata
    finally:
        temporary.unlink(missing_ok=True)


def top_candidates(index_path, *, asset, block_hash=None, limit=25):
    """Rank only addresses present in one local candidate snapshot."""
    if asset not in ASSET_NETWORK or type(limit) is not int or not 1 <= limit <= MAX_RESULTS:
        raise ValueError("unsupported asset or result limit")
    if asset == "BTC":
        if block_hash is not None:
            raise ValueError("BTC address aggregates have no common block anchor")
        anchor = ""
    else:
        if not isinstance(block_hash, str) or not HEX64.fullmatch(block_hash):
            raise ValueError("Ethereum ranking requires an exact block hash")
        anchor = block_hash.lower()
    with closing(sqlite3.connect(Path(index_path).resolve().as_uri() + "?mode=ro", uri=True)) as db:
        metadata = {key: json.loads(value) for key, value in db.execute("SELECT key, value FROM metadata")}
        if metadata.get("schema_version") != 1:
            raise ValueError("unsupported candidate index schema")
        count = db.execute("SELECT count(*) FROM balances WHERE asset=? AND block_hash=?", (asset, anchor)).fetchone()[0]
        rows = db.execute("""SELECT address, amount_base_units, source_id, retrieved_at, block_hash,
            block_height, block_time, selection FROM balances WHERE asset=? AND block_hash=?
            ORDER BY length(amount_base_units) DESC, amount_base_units DESC, address LIMIT ?""",
            (asset, anchor, limit)).fetchall()
    fields = ("address", "amount_base_units", "source_id", "retrieved_at", "block_hash",
              "block_height", "block_time", "selection")
    return {"kind": "private_sampled_address_balance_ranking", "asset": asset,
            "network": ASSET_NETWORK[asset], "block_hash": block_hash.lower() if block_hash else None,
            "sampled_address_count": count, "chain_history_complete": False,
            "network_wide_discovery_complete": False, "independent_balance_verification": False,
            "input_sha256": metadata["input_sha256"],
            "comparability": ("separate retrieval times; no common UTXO snapshot" if asset == "BTC"
                              else "same source-reported finalized block, without independent state verification"),
            "rows": [dict(zip(fields, row)) for row in rows],
            "semantics": "Addresses only. Ranking covers this local sample, not all holders or owners."}


def main():
    parser = argparse.ArgumentParser(description="Private sampled address-balance candidate index")
    actions = parser.add_subparsers(dest="action", required=True)
    build = actions.add_parser("build")
    build.add_argument("--input-jsonl", type=Path, required=True)
    build.add_argument("--index", type=Path, required=True)
    top = actions.add_parser("top")
    top.add_argument("--index", type=Path, required=True)
    top.add_argument("--asset", choices=tuple(ASSET_NETWORK), required=True)
    top.add_argument("--block-hash")
    top.add_argument("--limit", type=int, default=25)
    args = parser.parse_args()
    result = (build_index(args.input_jsonl, args.index) if args.action == "build" else
              top_candidates(args.index, asset=args.asset, block_hash=args.block_hash, limit=args.limit))
    print(json.dumps(result, sort_keys=True))


if __name__ == "__main__":
    main()
