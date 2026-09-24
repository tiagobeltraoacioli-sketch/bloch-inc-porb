"""Resume private ERC-20 holder-candidate discovery from an archive node."""

import argparse
import json
import os
import re
import sqlite3
import urllib.request
from collections import Counter
from contextlib import closing
from pathlib import Path
from urllib.parse import urlparse

from .ethereum import TOKEN_CONTRACTS, TRANSFER_TOPIC, ZERO_ADDRESS


CONTRACTS = {symbol.upper(): contract for contract, symbol in TOKEN_CONTRACTS.items()}
HEX64 = re.compile(r"0x[0-9a-fA-F]{64}\Z")
ADDRESS = re.compile(r"0x[0-9a-fA-F]{40}\Z")


class RpcError(RuntimeError):
    pass


def rpc_call(url, method, params):
    parsed = urlparse(url)
    if parsed.scheme != "http" or parsed.hostname not in ("127.0.0.1", "localhost"):
        raise ValueError("archive RPC must be bound to loopback")
    request = urllib.request.Request(url, data=json.dumps({
        "jsonrpc": "2.0", "id": 1, "method": method, "params": params,
    }).encode(), headers={"Content-Type": "application/json"})
    with urllib.request.urlopen(request, timeout=120) as response:
        payload = json.load(response)
    if payload.get("error"):
        raise RpcError(str(payload["error"]))
    if "result" not in payload:
        raise RpcError("missing JSON-RPC result")
    return payload["result"]


def _block(block):
    if (not isinstance(block, dict) or not HEX64.fullmatch(str(block.get("hash")))
            or not re.fullmatch(r"0x[0-9a-fA-F]+", str(block.get("number")))):
        raise ValueError("finalized block with hash and height required")
    return int(block["number"], 16), block["hash"].lower()


def _participants(log, contract, first, last):
    if (not isinstance(log, dict) or str(log.get("address", "")).lower() != contract
            or log.get("removed") is True or not HEX64.fullmatch(str(log.get("blockHash")))
            or not HEX64.fullmatch(str(log.get("transactionHash")))
            or not re.fullmatch(r"0x[0-9a-fA-F]+", str(log.get("blockNumber")))
            or not re.fullmatch(r"0x[0-9a-fA-F]+", str(log.get("logIndex")))
            or not HEX64.fullmatch(str(log.get("data")))):
        raise ValueError("invalid or removed Transfer log")
    height = int(log["blockNumber"], 16)
    if not first <= height <= last:
        raise ValueError("Transfer log outside requested range")
    topics = log.get("topics")
    if (not isinstance(topics, list) or len(topics) != 3
            or str(topics[0]).lower() != TRANSFER_TOPIC
            or not all(HEX64.fullmatch(str(value)) for value in topics[1:])
            or not all(value[2:26] == "0" * 24 for value in topics[1:])):
        raise ValueError("invalid indexed Transfer topics")
    addresses = ["0x" + value[-40:].lower() for value in topics[1:]]
    if not all(ADDRESS.fullmatch(value) for value in addresses):
        raise ValueError("invalid indexed address")
    return height, [value for value in addresses if value != ZERO_ADDRESS], (
        log["transactionHash"].lower(), int(log["logIndex"], 16))


def _initialize(db, asset, target_height, target_hash):
    db.executescript("""
        CREATE TABLE IF NOT EXISTS metadata(key TEXT PRIMARY KEY, value TEXT NOT NULL);
        CREATE TABLE IF NOT EXISTS candidates(
            address TEXT PRIMARY KEY, first_block INTEGER NOT NULL,
            last_block INTEGER NOT NULL, transfer_events INTEGER NOT NULL);
    """)
    stored = {key: json.loads(value) for key, value in db.execute("SELECT key, value FROM metadata")}
    if stored:
        if (stored.get("schema_version") != 1 or stored.get("asset") != asset
                or stored.get("contract") != CONTRACTS[asset]):
            raise ValueError("candidate index identity mismatch")
        return stored
    values = {"schema_version": 1, "asset": asset, "contract": CONTRACTS[asset],
              "target_height": target_height, "target_hash": target_hash,
              "next_block": 0, "ranges_scanned": 0, "logs_seen": 0,
              "transfer_history_scan_complete": False,
              "network_wide_holder_discovery_complete": False,
              "same_block_balance_reads_complete": False}
    with db:
        db.executemany("INSERT INTO metadata VALUES (?, ?)",
                       ((key, json.dumps(value)) for key, value in values.items()))
    return values


def scan(*, asset, index, rpc_url, max_ranges=100, window=500, call=rpc_call):
    """Scan at most max_ranges of finalized history, never skipping a failed range."""
    if asset not in CONTRACTS or not 1 <= max_ranges <= 100_000 or not 1 <= window <= 500:
        raise ValueError("unsupported asset or scan bounds")
    if call(rpc_url, "eth_syncing", []) is not False:
        return {"status": "waiting_for_archive_sync", "asset": asset}
    current_height, current_hash = _block(call(
        rpc_url, "eth_getBlockByNumber", ["finalized", False]))
    index = Path(index)
    index.parent.mkdir(parents=True, mode=0o700, exist_ok=True)
    os.chmod(index.parent, 0o700)
    with closing(sqlite3.connect(index)) as db:
        os.chmod(index, 0o600)
        state = _initialize(db, asset, current_height, current_hash)
        target_height, target_hash = state["target_height"], state["target_hash"]
        if _block(call(rpc_url, "eth_getBlockByNumber", [hex(target_height), False])) != (
                target_height, target_hash):
            raise ValueError("pinned finalized block is no longer canonical")
        processed = 0
        current_window = window
        while state["next_block"] <= target_height and processed < max_ranges:
            first = state["next_block"]
            last = min(first + current_window - 1, target_height)
            while True:
                try:
                    logs = call(rpc_url, "eth_getLogs", [{
                        "fromBlock": hex(first), "toBlock": hex(last),
                        "address": CONTRACTS[asset], "topics": [TRANSFER_TOPIC],
                    }])
                    break
                except RpcError as error:
                    detail = str(error).lower()
                    if last == first or not any(term in detail for term in (
                            "too many", "more than", "limit", "query range")):
                        raise
                    last = first + (last - first) // 2
                    current_window = last - first + 1
            if not isinstance(logs, list):
                raise ValueError("Transfer query did not return a list")
            unique = set()
            participants = Counter()
            heights = {}
            for log in logs:
                height, addresses, key = _participants(log, CONTRACTS[asset], first, last)
                if key in unique:
                    raise ValueError("duplicate Transfer log in one range")
                unique.add(key)
                for address in set(addresses):
                    participants[address] += 1
                    low, high = heights.get(address, (height, height))
                    heights[address] = min(low, height), max(high, height)
            with db:
                for address, events in participants.items():
                    low, high = heights[address]
                    db.execute("""INSERT INTO candidates VALUES (?, ?, ?, ?)
                        ON CONFLICT(address) DO UPDATE SET
                        first_block=min(first_block, excluded.first_block),
                        last_block=max(last_block, excluded.last_block),
                        transfer_events=transfer_events+excluded.transfer_events""",
                               (address, low, high, events))
                state["next_block"] = last + 1
                state["ranges_scanned"] += 1
                state["logs_seen"] += len(logs)
                state["transfer_history_scan_complete"] = state["next_block"] > target_height
                db.executemany("UPDATE metadata SET value=? WHERE key=?",
                               ((json.dumps(state[key]), key) for key in (
                                   "next_block", "ranges_scanned", "logs_seen",
                                   "transfer_history_scan_complete")))
            processed += 1
        if _block(call(rpc_url, "eth_getBlockByNumber", [hex(target_height), False])) != (
                target_height, target_hash):
            raise ValueError("pinned finalized block changed during scan")
        count = db.execute("SELECT count(*) FROM candidates").fetchone()[0]
        return {"status": "transfer_scan_complete" if state["transfer_history_scan_complete"]
                else "scanning", "asset": asset, "contract": CONTRACTS[asset],
                "target_height": target_height, "target_hash": target_hash,
                "next_block": state["next_block"], "ranges_scanned": state["ranges_scanned"],
                "candidate_count": count, "logs_seen": state["logs_seen"],
                "transfer_history_scan_complete": state["transfer_history_scan_complete"],
                "network_wide_holder_discovery_complete": False,
                "same_block_balance_reads_complete": False}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--asset", choices=tuple(CONTRACTS), required=True)
    parser.add_argument("--index", type=Path, required=True)
    parser.add_argument("--rpc-url", default="http://127.0.0.1:8545")
    parser.add_argument("--max-ranges", type=int, default=100)
    parser.add_argument("--window", type=int, default=500)
    args = parser.parse_args()
    print(json.dumps(scan(asset=args.asset, index=args.index, rpc_url=args.rpc_url,
                          max_ranges=args.max_ranges, window=args.window), sort_keys=True))


if __name__ == "__main__":
    main()
