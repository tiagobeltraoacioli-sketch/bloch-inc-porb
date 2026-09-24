"""Read every event-discovered token address balance at one pinned block."""

import argparse
import json
import re
import sqlite3
import urllib.request
from contextlib import closing
from pathlib import Path
from urllib.parse import urlparse

from .ethereum_token_candidates import CONTRACTS, RpcError, _block, rpc_call


BALANCE_OF_SELECTOR = "70a08231"
HEX_BALANCE = re.compile(r"0x[0-9a-fA-F]{1,64}\Z")
BATCH_SIZE = 100


def rpc_batch(url, requests):
    parsed = urlparse(url)
    if parsed.scheme != "http" or parsed.hostname not in ("127.0.0.1", "localhost"):
        raise ValueError("archive RPC must be bound to loopback")
    payload = [{"jsonrpc": "2.0", "id": index, "method": method, "params": params}
               for index, (method, params) in enumerate(requests)]
    request = urllib.request.Request(url, data=json.dumps(payload).encode(),
                                     headers={"Content-Type": "application/json"})
    with urllib.request.urlopen(request, timeout=120) as response:
        received = json.load(response)
    if not isinstance(received, list) or len(received) != len(payload):
        raise RpcError("incomplete JSON-RPC balance batch")
    by_id = {}
    for item in received:
        if (not isinstance(item, dict) or type(item.get("id")) is not int
                or item["id"] in by_id or not 0 <= item["id"] < len(payload)):
            raise RpcError("invalid JSON-RPC batch identifier")
        if item.get("error") or "result" not in item:
            raise RpcError(str(item.get("error", "missing result")))
        by_id[item["id"]] = item["result"]
    return [by_id[index] for index in range(len(payload))]


def collect(*, asset, index, rpc_url, max_accounts=10_000, call=rpc_call,
            batch_call=rpc_batch):
    if asset not in CONTRACTS or type(max_accounts) is not int or not 1 <= max_accounts <= 10_000:
        raise ValueError("unsupported asset or collection bound")
    if call(rpc_url, "eth_syncing", []) is not False:
        return {"status": "waiting_for_archive_sync", "asset": asset}
    uri = Path(index)
    if not uri.is_file():
        return {"status": "waiting_for_transfer_index", "asset": asset}
    with closing(sqlite3.connect(uri)) as db:
        state = {key: json.loads(value) for key, value in db.execute("SELECT key, value FROM metadata")}
        if state.get("asset") != asset or state.get("contract") != CONTRACTS[asset]:
            raise ValueError("token index identity mismatch")
        if state.get("transfer_history_scan_complete") is not True:
            return {"status": "waiting_for_transfer_scan", "asset": asset,
                    "next_block": state.get("next_block")}
        height, block_hash = state["target_height"], state["target_hash"]
        if _block(call(rpc_url, "eth_getBlockByNumber", [hex(height), False])) != (height, block_hash):
            raise ValueError("token balance block is no longer canonical")
        db.execute("""CREATE TABLE IF NOT EXISTS balances(
            address TEXT PRIMARY KEY, amount_base_units TEXT NOT NULL)""")
        rows = db.execute("""SELECT address FROM candidates
            WHERE address NOT IN (SELECT address FROM balances)
            ORDER BY address LIMIT ?""", (max_accounts,)).fetchall()
        block_ref = {"blockHash": block_hash, "requireCanonical": True}
        completed = 0
        for start in range(0, len(rows), BATCH_SIZE):
            addresses = [address for (address,) in rows[start:start + BATCH_SIZE]]
            requests = [("eth_call", [{"to": CONTRACTS[asset],
                          "data": "0x" + BALANCE_OF_SELECTOR + "0" * 24 + address[2:]},
                         block_ref]) for address in addresses]
            values = batch_call(rpc_url, requests)
            if len(values) != len(addresses) or any(
                    not isinstance(value, str) or not HEX_BALANCE.fullmatch(value)
                    for value in values):
                raise ValueError("invalid source-reported balanceOf batch")
            with db:
                db.executemany("INSERT INTO balances VALUES (?, ?)",
                               ((address, str(int(value, 16)))
                                for address, value in zip(addresses, values)))
            completed += len(addresses)
        remaining = db.execute("""SELECT count(*) FROM candidates
            WHERE address NOT IN (SELECT address FROM balances)""").fetchone()[0]
        if remaining == 0 and _block(call(rpc_url, "eth_getBlockByNumber", [hex(height), False])) == (
                height, block_hash):
            with db:
                db.execute("UPDATE metadata SET value='true' WHERE key='same_block_balance_reads_complete'")
        total = db.execute("SELECT count(*) FROM candidates").fetchone()[0]
        return {"status": "event_candidate_balance_reads_complete" if remaining == 0 else "reading_balances",
                "asset": asset, "target_height": height, "target_hash": block_hash,
                "candidate_count": total, "balances_read": total - remaining,
                "remaining": remaining, "read_this_run": completed,
                "network_wide_holder_discovery_complete": False}


def top_event_candidates(index, *, asset, limit=64):
    if asset not in CONTRACTS or type(limit) is not int or not 1 <= limit <= 64:
        raise ValueError("unsupported asset or rank limit")
    with closing(sqlite3.connect(Path(index).resolve().as_uri() + "?mode=ro", uri=True)) as db:
        state = {key: json.loads(value) for key, value in db.execute("SELECT key, value FROM metadata")}
        if (state.get("schema_version") != 1 or state.get("asset") != asset
                or state.get("contract") != CONTRACTS[asset]
                or state.get("transfer_history_scan_complete") is not True
                or state.get("same_block_balance_reads_complete") is not True
                or type(state.get("target_height")) is not int
                or state["target_height"] < 0
                or not re.fullmatch(r"0x[0-9a-fA-F]{64}", str(state.get("target_hash")))
                or type(state.get("next_block")) is not int
                or state["next_block"] <= state["target_height"]):
            raise ValueError("same-block balance reads are incomplete")
        count, balances, missing = db.execute("""SELECT
            (SELECT count(*) FROM candidates),
            (SELECT count(*) FROM balances),
            (SELECT count(*) FROM candidates c LEFT JOIN balances b
                ON b.address=c.address WHERE b.address IS NULL)""").fetchone()
        if count != balances or missing:
            raise ValueError("candidate balance coverage is incomplete")
        invalid = db.execute("""SELECT count(*) FROM balances WHERE
            typeof(address) != 'text' OR length(address) != 42
            OR substr(address, 1, 2) != '0x' OR address != lower(address)
            OR substr(address, 3) GLOB '*[^0-9a-f]*'
            OR typeof(amount_base_units) != 'text' OR amount_base_units = ''
            OR length(amount_base_units) > 78
            OR amount_base_units GLOB '*[^0-9]*'
            OR (length(amount_base_units) > 1 AND substr(amount_base_units, 1, 1) = '0')""").fetchone()[0]
        if invalid:
            raise ValueError("invalid candidate balance row")
        rows = db.execute("""SELECT address, amount_base_units FROM balances
            WHERE amount_base_units != '0'
            ORDER BY length(amount_base_units) DESC, amount_base_units DESC, address ASC
            LIMIT ?""", (limit,)).fetchall()
        if any(not isinstance(address, str) or not re.fullmatch(r"0x[0-9a-f]{40}", address)
               or not isinstance(amount, str) or len(amount) > 78
               or not re.fullmatch(r"[1-9][0-9]*", amount)
               or int(amount) >= 1 << 256 for address, amount in rows):
            raise ValueError("invalid candidate balance row")
    return {"kind": "private_event_discovered_token_balance_ranking",
            "asset": asset, "network": "ethereum-mainnet",
            "contract": CONTRACTS[asset], "block_height": state["target_height"],
            "block_hash": state["target_hash"], "event_candidate_count": count,
            "transfer_history_scan_complete": True,
            "same_block_balance_reads_complete": True,
            "network_wide_holder_discovery_complete": False,
            "independent_balance_verification": False,
            "semantics": "Ranks only addresses discovered through contract Transfer events; not owners or all possible holders.",
            "rows": [{"rank": rank, "address": address, "amount_base_units": amount,
                      "unit": "token-base-unit"} for rank, (address, amount) in enumerate(rows, 1)]}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("action", choices=("collect", "top"))
    parser.add_argument("--asset", choices=tuple(CONTRACTS), required=True)
    parser.add_argument("--index", type=Path, required=True)
    parser.add_argument("--rpc-url", default="http://127.0.0.1:8545")
    parser.add_argument("--max-accounts", type=int, default=10_000)
    args = parser.parse_args()
    result = (collect(asset=args.asset, index=args.index, rpc_url=args.rpc_url,
                      max_accounts=args.max_accounts) if args.action == "collect"
              else top_event_candidates(args.index, asset=args.asset))
    print(json.dumps(result, sort_keys=True))


if __name__ == "__main__":
    main()
