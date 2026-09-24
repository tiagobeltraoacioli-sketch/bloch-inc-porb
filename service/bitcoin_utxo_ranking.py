"""Rank Bitcoin output scripts from one complete, validated UTXO snapshot.

The input SQLite database must come from Bitcoin Core's utxo_to_sqlite.py.
An output script is a chain identifier, not a person or a wallet owner.
"""

import argparse
import hashlib
import json
import re
import sqlite3
import subprocess
from contextlib import closing
from pathlib import Path


MAINNET_MAGIC = bytes.fromhex("f9beb4d9")
MAX_SATS = 21_000_000 * 100_000_000
HEX64 = re.compile(r"[0-9a-fA-F]{64}\Z")


def _read_snapshot_header(path):
    with Path(path).open("rb") as stream:
        header = stream.read(51)
    if len(header) != 51 or header[:5] != b"utxo\xff":
        raise ValueError("invalid Bitcoin Core UTXO snapshot header")
    if int.from_bytes(header[5:7], "little") != 2 or header[7:11] != MAINNET_MAGIC:
        raise ValueError("unsupported snapshot version or network")
    return {"base_hash": header[11:43][::-1].hex(),
            "coins_written": int.from_bytes(header[43:51], "little")}


def _decode_address(script_hex, *, cli, conf, datadir):
    command = [str(cli), f"-conf={conf}", f"-datadir={datadir}",
               "decodescript", script_hex]
    result = subprocess.run(command, capture_output=True, text=True,
                            check=True, timeout=15)
    decoded = json.loads(result.stdout)
    return decoded.get("address"), decoded.get("type")


def rank_snapshot(sqlite_path, snapshot_path, snapshot_metadata, chain_info, *,
                  limit=64, cli=None, conf=None, datadir=None):
    """Return exact script balances at one complete mainnet snapshot anchor."""
    if type(limit) is not int or not 1 <= limit <= 64:
        raise ValueError("limit must be between 1 and 64")
    if any(value is not None for value in (cli, conf, datadir)) and not all(
            value is not None for value in (cli, conf, datadir)):
        raise ValueError("CLI, config and data directory must be supplied together")
    metadata = json.loads(Path(snapshot_metadata).read_text())
    chain = json.loads(Path(chain_info).read_text())
    header = _read_snapshot_header(snapshot_path)
    base_hash = metadata.get("base_hash")
    coin_count = metadata.get("coins_written")
    base_height = metadata.get("base_height")
    if (not isinstance(base_hash, str) or not HEX64.fullmatch(base_hash)
            or base_hash.lower() != header["base_hash"]
            or type(coin_count) is not int or coin_count <= 0
            or coin_count != header["coins_written"]
            or type(base_height) is not int or base_height < 0):
        raise ValueError("snapshot metadata does not match its mainnet header")
    if (chain.get("chain") != "main" or chain.get("initialblockdownload") is not False
            or type(chain.get("blocks")) is not int or chain["blocks"] < base_height):
        raise ValueError("Bitcoin Core full validation was not complete")
    uri = Path(sqlite_path).resolve().as_uri() + "?mode=ro"
    with closing(sqlite3.connect(uri, uri=True)) as db:
        fields = [row[1] for row in db.execute("PRAGMA table_info(utxos)")]
        if fields != ["txid", "vout", "value", "coinbase", "height", "scriptpubkey"]:
            raise ValueError("unexpected UTXO converter schema")
        count, total, smallest, largest = db.execute(
            "SELECT count(*), sum(value), min(value), max(value) FROM utxos").fetchone()
        if (count != coin_count or type(total) is not int or total > MAX_SATS
                or smallest < 0 or largest > MAX_SATS):
            raise ValueError("converted UTXO count or amounts are invalid")
        rows = db.execute("""SELECT scriptpubkey, sum(value) AS amount, count(*) AS coins
            FROM utxos GROUP BY scriptpubkey
            ORDER BY amount DESC, scriptpubkey ASC LIMIT ?""", (limit,)).fetchall()
    ranked = []
    for script, amount, coins in rows:
        if not isinstance(script, str) or len(script) % 2 or not re.fullmatch(r"[0-9a-fA-F]*", script):
            raise ValueError("converter returned an invalid scriptPubKey")
        script = script.lower()
        address = output_type = None
        if cli is not None:
            address, output_type = _decode_address(script, cli=cli, conf=conf,
                                                   datadir=datadir)
        ranked.append({"rank": len(ranked) + 1,
                       "scriptpubkey_sha256": hashlib.sha256(bytes.fromhex(script)).hexdigest(),
                       "scriptpubkey": script, "address": address,
                       "output_type": output_type, "amount_base_units": str(amount),
                       "unit": "sat", "utxo_count": coins})
    return {"kind": "bitcoin_mainnet_utxo_script_ranking", "asset": "BTC",
            "network": "bitcoin-mainnet", "base_hash": base_hash.lower(),
            "base_height": base_height, "snapshot_coin_count": coin_count,
            "snapshot_total_sats": str(total),
            "coverage": "all_confirmed_utxos_in_one_validated_snapshot",
            "network_wide_script_discovery_complete": True,
            "independent_snapshot_verification": False,
            "semantics": "Output scripts are not wallet owners; no address exists for some scripts.",
            "rows": ranked}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--sqlite", type=Path, required=True)
    parser.add_argument("--snapshot", type=Path, required=True)
    parser.add_argument("--snapshot-metadata", type=Path, required=True)
    parser.add_argument("--chain-info", type=Path, required=True)
    parser.add_argument("--bitcoin-cli", type=Path)
    parser.add_argument("--bitcoin-conf", type=Path)
    parser.add_argument("--bitcoin-datadir", type=Path)
    args = parser.parse_args()
    result = rank_snapshot(args.sqlite, args.snapshot, args.snapshot_metadata,
                           args.chain_info, cli=args.bitcoin_cli,
                           conf=args.bitcoin_conf, datadir=args.bitcoin_datadir)
    print(json.dumps(result, sort_keys=True))


if __name__ == "__main__":
    main()
