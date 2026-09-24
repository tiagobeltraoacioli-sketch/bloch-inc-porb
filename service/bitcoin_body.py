"""Bounded local Bitcoin transaction body checks for a private block pilot."""

import argparse
import hashlib
import json
import re
from pathlib import Path

from .bitcoin_pilot import fetch, write_private


MAX_TRANSACTION_BYTES = 500_000
MAX_PILOT_BYTES = 8_000_000
MAX_ELEMENTS = 100_000
HEX = re.compile(r"[0-9a-fA-F]+\Z")


class Reader:
    def __init__(self, data):
        self.data = data
        self.pos = 0

    def take(self, count):
        if type(count) is not int or count < 0 or count > len(self.data) - self.pos:
            raise ValueError("truncated Bitcoin transaction")
        value = self.data[self.pos:self.pos + count]
        self.pos += count
        return value

    def compact_size(self):
        prefix = self.take(1)[0]
        if prefix < 253:
            value = prefix
        elif prefix == 253:
            value = int.from_bytes(self.take(2), "little")
            if value < 253:
                raise ValueError("noncanonical Bitcoin CompactSize")
        elif prefix == 254:
            value = int.from_bytes(self.take(4), "little")
            if value <= 0xffff:
                raise ValueError("noncanonical Bitcoin CompactSize")
        else:
            value = int.from_bytes(self.take(8), "little")
            if value <= 0xffffffff:
                raise ValueError("noncanonical Bitcoin CompactSize")
        if value > MAX_ELEMENTS or value > len(self.data):
            raise ValueError("Bitcoin transaction element exceeds bound")
        return value


def parse_transaction(raw_hex):
    if (not isinstance(raw_hex, str) or len(raw_hex) % 2 or not HEX.fullmatch(raw_hex)
            or len(raw_hex) // 2 > MAX_TRANSACTION_BYTES):
        raise ValueError("invalid bounded Bitcoin transaction hex")
    data = bytes.fromhex(raw_hex)
    reader = Reader(data)
    version = reader.take(4)
    segwit = data[reader.pos:reader.pos + 2] == b"\x00\x01"
    if segwit:
        reader.take(2)
    input_start = reader.pos
    input_count = reader.compact_size()
    if input_count == 0:
        raise ValueError("Bitcoin transaction has no inputs")
    inputs = []
    for _ in range(input_count):
        prior_txid = reader.take(32)[::-1].hex()
        prior_vout = int.from_bytes(reader.take(4), "little")
        reader.take(reader.compact_size())
        reader.take(4)
        inputs.append({"txid": prior_txid, "vout": prior_vout})
    output_count = reader.compact_size()
    if output_count == 0:
        raise ValueError("Bitcoin transaction has no outputs")
    outputs = []
    for _ in range(output_count):
        value = int.from_bytes(reader.take(8), "little")
        if value > 2_100_000_000_000_000:
            raise ValueError("Bitcoin output exceeds supply bound")
        script = reader.take(reader.compact_size()).hex()
        outputs.append({"value_sat": str(value), "scriptpubkey_hex": script})
    output_end = reader.pos
    if segwit:
        any_witness = False
        for _ in range(input_count):
            stack_count = reader.compact_size()
            any_witness |= stack_count > 0
            for _ in range(stack_count):
                reader.take(reader.compact_size())
        if not any_witness:
            raise ValueError("superfluous Bitcoin witness encoding")
    lock_time = reader.take(4)
    if reader.pos != len(data):
        raise ValueError("Bitcoin transaction has trailing bytes")
    stripped = version + data[input_start:output_end] + lock_time
    txid = hashlib.sha256(hashlib.sha256(stripped).digest()).digest()[::-1].hex()
    coinbase = len(inputs) == 1 and inputs[0] == {"txid": "0" * 64, "vout": 0xffffffff}
    return {"txid": txid, "inputs": inputs, "outputs": outputs,
            "coinbase": coinbase, "has_witness": segwit}


def verify_transaction_body(transaction):
    parsed = parse_transaction(transaction.get("raw_transaction_hex"))
    if parsed["txid"] != transaction.get("txid"):
        raise ValueError("Bitcoin raw transaction txid mismatch")
    observed_inputs = transaction.get("inputs")
    if not isinstance(observed_inputs, list) or len(observed_inputs) != len(parsed["inputs"]):
        raise ValueError("Bitcoin raw transaction input count mismatch")
    for index, (observed, prior) in enumerate(zip(observed_inputs, parsed["inputs"])):
        if parsed["coinbase"] and index == 0:
            if observed != {"kind": "coinbase_input", "spent_outpoint": None}:
                raise ValueError("Bitcoin raw coinbase input mismatch")
        elif observed != {"kind": "spent_outpoint_reference", "spent_outpoint": prior}:
            raise ValueError("Bitcoin raw transaction input mismatch")
    observed_outputs = transaction.get("outputs")
    if not isinstance(observed_outputs, list) or len(observed_outputs) != len(parsed["outputs"]):
        raise ValueError("Bitcoin raw transaction output count mismatch")
    for observed, output in zip(observed_outputs, parsed["outputs"]):
        if (observed.get("value_sat") != output["value_sat"]
                or observed.get("scriptpubkey_hex") != output["scriptpubkey_hex"]):
            raise ValueError("Bitcoin raw transaction output mismatch")
    return parsed


def upgrade_pilot(pilot_path, *, get=fetch):
    """Fetch raw bodies for one verified schema-v2 artifact and return schema v3."""
    from .data_quality import inspect_bitcoin_pilot

    pilot_path = Path(pilot_path)
    with pilot_path.open("rb") as handle:
        raw = handle.read(MAX_PILOT_BYTES + 1)
    if len(raw) > MAX_PILOT_BYTES:
        raise ValueError("Bitcoin pilot exceeds byte bound")
    evidence = inspect_bitcoin_pilot(pilot_path)
    if hashlib.sha256(raw).hexdigest() != evidence["sample_digest"]:
        raise ValueError("Bitcoin pilot changed after validation")
    sample = json.loads(raw)
    if sample.get("schema_version") != 2:
        raise ValueError("Bitcoin body upgrade requires schema-v2 pilot")
    for transaction in sample["transactions"]:
        transaction["raw_transaction_hex"] = get(f"/tx/{transaction['txid']}/hex")
        verify_transaction_body(transaction)
    sample["schema_version"] = 3
    sample["transaction_bodies_locally_verified_against_txids"] = True
    sample["source_reported_addresses_locally_verified"] = False
    return sample


def main():
    parser = argparse.ArgumentParser(description="Verify raw Bitcoin bodies for a private pilot")
    parser.add_argument("--pilot", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    if args.output.resolve() == args.pilot.resolve():
        raise ValueError("output must differ from original pilot")
    sample = upgrade_pilot(args.pilot)
    digest = write_private(sample, args.output)
    print(json.dumps({"kind": sample["kind"], "schema_version": sample["schema_version"],
                      "sampled_transactions": sample["sampled_transactions"],
                      "bodies_locally_verified": True, "artifact_sha256": digest}))


if __name__ == "__main__":
    main()
