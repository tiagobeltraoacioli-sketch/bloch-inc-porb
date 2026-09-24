"""Check one Bitcoin mainnet header hash against its encoded work target."""

import argparse
import hashlib
import json
from pathlib import Path

from .bitcoin_pilot import write_private
from .data_quality import inspect_bitcoin_pilot


MAINNET_POW_LIMIT = int("00000000ffffffffffffffffffffffffffffffffffffffffffffffffffffffff", 16)
MAX_PILOT_BYTES = 8_000_000


def compact_target(bits):
    """Decode nBits using Bitcoin Core's SetCompact range semantics."""
    if type(bits) is not int or not 0 <= bits <= 0xffffffff:
        raise ValueError("invalid Bitcoin compact target")
    size = bits >> 24
    word = bits & 0x007fffff
    if size <= 3:
        word >>= 8 * (3 - size)
        target = word
    else:
        target = word << (8 * (size - 3))
    negative = word != 0 and bool(bits & 0x00800000)
    overflow = word != 0 and (size > 34 or (word > 0xff and size > 33)
                                  or (word > 0xffff and size > 32))
    if negative or overflow or target == 0 or target > MAINNET_POW_LIMIT:
        raise ValueError("Bitcoin header target invalid for mainnet")
    return target


def check_header_pow(header_hex):
    if not isinstance(header_hex, str) or len(header_hex) != 160:
        raise ValueError("invalid Bitcoin header length")
    try:
        header = bytes.fromhex(header_hex)
    except ValueError as error:
        raise ValueError("invalid Bitcoin header hex") from error
    bits = int.from_bytes(header[72:76], "little")
    target = compact_target(bits)
    digest = hashlib.sha256(hashlib.sha256(header).digest()).digest()
    hash_integer = int.from_bytes(digest, "little")
    if hash_integer > target:
        raise ValueError("Bitcoin header hash exceeds claimed work target")
    return {"n_bits_hex": f"{bits:08x}", "target_hex": f"{target:064x}",
            "block_hash": digest[::-1].hex()}


def build_report(pilot_path):
    pilot_path = Path(pilot_path)
    with pilot_path.open("rb") as handle:
        raw = handle.read(MAX_PILOT_BYTES + 1)
    if len(raw) > MAX_PILOT_BYTES:
        raise ValueError("Bitcoin PoW pilot exceeds byte bound")
    evidence = inspect_bitcoin_pilot(pilot_path)
    if hashlib.sha256(raw).hexdigest() != evidence["sample_digest"]:
        raise ValueError("Bitcoin PoW pilot changed after validation")
    sample = json.loads(raw)
    if sample["schema_version"] != 3 or not evidence["transaction_bodies_locally_verified_against_txids"]:
        raise ValueError("Bitcoin PoW report requires body-verified schema-v3 pilot")
    work = check_header_pow(sample["block_header_hex"])
    if work["block_hash"] != sample["block_hash"]:
        raise ValueError("Bitcoin PoW header hash differs from pilot")
    return {
        "kind": "bounded_private_bitcoin_header_pow_report",
        "source_id": evidence["source_id"],
        "sample_digest": evidence["sample_digest"],
        "block_height": evidence["block_height"],
        "n_bits_hex": work["n_bits_hex"],
        "target_hex": work["target_hex"],
        "header_hash_meets_claimed_target": True,
        "mainnet_pow_limit_applied": True,
        "sampled_transaction_bodies_locally_verified": True,
        "sampled_transaction_merkle_inclusion_locally_verified": True,
        "difficulty_transition_verified": False,
        "cumulative_chainwork_verified": False,
        "best_chain_independently_verified": False,
        "full_consensus_validity_verified": False,
        "chain_history_complete": False,
        "aml_scores_computed": 0,
        "public_release": False,
    }


def main():
    parser = argparse.ArgumentParser(description="Private Bitcoin header work check")
    parser.add_argument("--pilot", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    if args.output.resolve() == args.pilot.resolve():
        raise ValueError("report path must differ from pilot path")
    report = build_report(args.pilot)
    write_private(report, args.output)
    print(json.dumps({key: report[key] for key in (
        "kind", "block_height", "n_bits_hex", "header_hash_meets_claimed_target",
        "difficulty_transition_verified", "cumulative_chainwork_verified")}))


if __name__ == "__main__":
    main()
