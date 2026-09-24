"""Validate a completed private top-64 artifact before any release review."""

import argparse
import hashlib
import json
import re
import stat
from datetime import datetime
from pathlib import Path

HEX64 = re.compile(r"[0-9a-f]{64}\Z")
ADDRESS = re.compile(r"0x[0-9a-f]{40}\Z")
DECIMAL = re.compile(r"[1-9][0-9]*\Z")
MAX_ARTIFACT_BYTES = 2_000_000
MAX_SATS = 21_000_000 * 100_000_000
CONVERTER_SHA256 = "532bb3ce8c84d1448b930b7f9195e97ce604da713c5d5e58c00ceff27490e9b9"
CONTRACTS = {
    "USDT": "0xdac17f958d2ee523a2206206994597c13d831ec7",
    "USDC": "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48",
}


def _positive(value, maximum):
    if (not isinstance(value, str) or len(value) > len(str(maximum))
            or not DECIMAL.fullmatch(value)):
        raise ValueError("invalid positive base-unit amount")
    amount = int(value)
    if amount > maximum:
        raise ValueError("base-unit amount exceeds asset bound")
    return amount


def _timestamp(value):
    if not isinstance(value, str) or not value.endswith("Z"):
        raise ValueError("UTC generation time required")
    try:
        datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError as error:
        raise ValueError("invalid UTC generation time") from error


def _rows(document):
    rows = document.get("rows")
    if not isinstance(rows, list) or not 1 <= len(rows) <= 64:
        raise ValueError("private ranking must contain 1 to 64 rows")
    if any(not isinstance(row, dict) or row.get("rank") != index
           for index, row in enumerate(rows, 1)):
        raise ValueError("nonsequential private ranking")
    return rows


def _bitcoin(document):
    if (document.get("kind") != "bitcoin_mainnet_utxo_script_ranking"
            or document.get("asset") != "BTC"
            or document.get("network") != "bitcoin-mainnet"
            or document.get("coverage") != "all_confirmed_utxos_in_one_validated_snapshot"
            or document.get("network_wide_script_discovery_complete") is not True
            or document.get("independent_snapshot_verification") is not False
            or document.get("converter_sha256") != CONVERTER_SHA256
            or not HEX64.fullmatch(str(document.get("base_hash")))
            or not HEX64.fullmatch(str(document.get("snapshot_sha256")))
            or type(document.get("base_height")) is not int
            or document["base_height"] < 0
            or type(document.get("snapshot_coin_count")) is not int
            or document["snapshot_coin_count"] < 1):
        raise ValueError("invalid Bitcoin snapshot provenance")
    total = _positive(document.get("snapshot_total_sats"), MAX_SATS)
    rows = _rows(document)
    seen = set()
    previous = None
    sum_top = 0
    for row in rows:
        script = row.get("scriptpubkey")
        if (not isinstance(script, str) or len(script) > 20_000
                or len(script) % 2 or not re.fullmatch(r"[0-9a-f]*", script)
                or script in seen or not HEX64.fullmatch(str(row.get("scriptpubkey_sha256")))
                or hashlib.sha256(bytes.fromhex(script)).hexdigest() != row["scriptpubkey_sha256"]
                or type(row.get("utxo_count")) is not int or row["utxo_count"] < 1
                or row.get("unit") != "sat"
                or row.get("address") is not None and not isinstance(row["address"], str)):
            raise ValueError("invalid Bitcoin script row")
        amount = _positive(row.get("amount_base_units"), MAX_SATS)
        if previous is not None and (amount > previous[0]
                                     or amount == previous[0] and script <= previous[1]):
            raise ValueError("Bitcoin rows are not in exact ranking order")
        seen.add(script)
        previous = (amount, script)
        sum_top += amount
    if sum_top > total:
        raise ValueError("top scripts exceed snapshot total")
    return {"asset": "BTC", "anchor": {"height": document["base_height"],
            "hash": document["base_hash"]}, "record_count": len(rows),
            "coverage": "all_confirmed_utxos_in_one_validated_snapshot"}


def _token(document, asset):
    if (document.get("kind") != "private_event_discovered_token_balance_ranking"
            or document.get("asset") != asset
            or document.get("network") != "ethereum-mainnet"
            or document.get("contract") != CONTRACTS[asset]
            or not isinstance(document.get("block_hash"), str)
            or not document["block_hash"].startswith("0x")
            or not HEX64.fullmatch(document["block_hash"][2:])
            or type(document.get("block_height")) is not int
            or document["block_height"] < 0
            or type(document.get("event_candidate_count")) is not int
            or document["event_candidate_count"] < 1
            or document.get("transfer_history_scan_complete") is not True
            or document.get("same_block_balance_reads_complete") is not True
            or document.get("network_wide_holder_discovery_complete") is not False
            or document.get("independent_balance_verification") is not False):
        raise ValueError("invalid token candidate provenance")
    rows = _rows(document)
    if len(rows) > document["event_candidate_count"]:
        raise ValueError("token rows exceed discovered candidates")
    seen = set()
    previous = None
    for row in rows:
        address = row.get("address")
        if (not isinstance(address, str) or not ADDRESS.fullmatch(address)
                or address in seen or row.get("unit") != "token-base-unit"):
            raise ValueError("invalid token candidate row")
        amount = _positive(row.get("amount_base_units"), (1 << 256) - 1)
        if previous is not None and (amount > previous[0]
                                     or amount == previous[0] and address <= previous[1]):
            raise ValueError("token rows are not in exact ranking order")
        seen.add(address)
        previous = (amount, address)
    return {"asset": asset, "anchor": {"height": document["block_height"],
            "hash": document["block_hash"]}, "record_count": len(rows),
            "coverage": "event_discovered_addresses_only"}


def inspect(path, *, asset):
    path = Path(path)
    if path.is_symlink() or not path.is_file():
        raise ValueError("private artifact is missing or not a regular file")
    file_stat = path.stat()
    if stat.S_IMODE(file_stat.st_mode) != 0o600 or not 0 < file_stat.st_size <= MAX_ARTIFACT_BYTES:
        raise ValueError("private artifact mode or size is invalid")
    content = path.read_bytes()
    if len(content) != file_stat.st_size:
        raise ValueError("private artifact changed during review")
    document = json.loads(content)
    if not isinstance(document, dict) or document.get("publication_status") != "private_pending_review":
        raise ValueError("private review status required")
    _timestamp(document.get("generated_at"))
    if asset == "BTC":
        summary = _bitcoin(document)
    elif asset in CONTRACTS:
        summary = _token(document, asset)
    else:
        raise ValueError("unsupported review asset")
    return {**summary, "artifact_sha256": hashlib.sha256(content).hexdigest(),
            "private_review_ready": True, "public_release_ready": False,
            "generated_at": document["generated_at"]}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--asset", choices=("BTC", *CONTRACTS), required=True)
    parser.add_argument("--artifact", type=Path, required=True)
    args = parser.parse_args()
    print(json.dumps(inspect(args.artifact, asset=args.asset), sort_keys=True))


if __name__ == "__main__":
    main()
