import hashlib
import json
import tempfile
import unittest
from pathlib import Path

from service.bitcoin_body import parse_transaction, upgrade_pilot
from service.bitcoin_graph_pilot import build_report
from service.bitcoin_pilot import collect, write_private
from service.data_quality import inspect_bitcoin_pilot


def double_sha256(value):
    return hashlib.sha256(hashlib.sha256(value).digest()).digest()


def txid(raw):
    return double_sha256(raw)[::-1].hex()


def fixture():
    coinbase = (bytes.fromhex("0100000001") + bytes(32) + bytes.fromhex("ffffffff0100ffffffff01")
                + (50).to_bytes(8, "little") + bytes.fromhex("015100000000"))
    first = txid(coinbase)
    spend = (bytes.fromhex("0100000001") + bytes.fromhex(first)[::-1]
             + bytes.fromhex("0000000000ffffffff01") + (25).to_bytes(8, "little")
             + bytes.fromhex("015100000000"))
    second = txid(spend)
    merkle = double_sha256(bytes.fromhex(first)[::-1] + bytes.fromhex(second)[::-1])[::-1].hex()
    header = bytes(36) + bytes.fromhex(merkle)[::-1] + bytes(12)
    block = double_sha256(header)[::-1].hex()
    calls = []

    def get(path):
        calls.append(path)
        if path == "/blocks/tip/height":
            return "1000" if calls.count(path) == 1 else "1001"
        if path == "/block-height/995":
            return block
        if path == f"/block/{block}":
            return {"id": block, "height": 995, "tx_count": 2, "merkle_root": merkle}
        if path == f"/block/{block}/header":
            return header.hex()
        if path == f"/block/{block}/status":
            return {"in_best_chain": True}
        if path == f"/block/{block}/txid/0":
            return first
        if path == f"/block/{block}/txid/1":
            return second
        if path == f"/tx/{first}":
            return {"txid": first, "status": {"confirmed": True, "block_hash": block,
                    "block_height": 995}, "vin": [{"is_coinbase": True}],
                    "vout": [{"value": 50, "scriptpubkey": "51"}]}
        if path == f"/tx/{second}":
            return {"txid": second, "status": {"confirmed": True, "block_hash": block,
                    "block_height": 995}, "vin": [{"is_coinbase": False, "txid": first, "vout": 0}],
                    "vout": [{"value": 25, "scriptpubkey": "51"}]}
        if path == f"/tx/{first}/merkle-proof":
            return {"block_height": 995, "pos": 0, "merkle": [second]}
        if path == f"/tx/{second}/merkle-proof":
            return {"block_height": 995, "pos": 1, "merkle": [first]}
        if path == f"/tx/{first}/hex":
            return coinbase.hex()
        if path == f"/tx/{second}/hex":
            return spend.hex()
        raise AssertionError(path)

    return get, first, second, coinbase, spend


class BitcoinBodyTest(unittest.TestCase):
    def test_upgrade_checks_bodies_and_enables_verified_graph(self):
        get, first, second, _, _ = fixture()
        with tempfile.TemporaryDirectory() as temporary:
            folder = Path(temporary)
            old_path, new_path = folder / "v2.json", folder / "v3.json"
            write_private(collect(min_confirmations=6, tx_limit=2, get=get), old_path)
            upgraded = upgrade_pilot(old_path, get=get)
            self.assertEqual(upgraded["schema_version"], 3)
            self.assertEqual(upgraded["transactions"][1]["txid"], second)
            write_private(upgraded, new_path)
            evidence = inspect_bitcoin_pilot(new_path)
            self.assertTrue(evidence["transaction_bodies_locally_verified_against_txids"])
            graph = build_report(new_path)
            self.assertEqual(graph["within_sample_outpoint_links"], 1)
            self.assertTrue(graph["transaction_bodies_locally_verified_against_txids"])
            self.assertNotIn(first, json.dumps(graph))
            upgraded["transactions"][1]["outputs"][0]["value_sat"] = "26"
            write_private(upgraded, new_path)
            with self.assertRaisesRegex(ValueError, "raw transaction output mismatch"):
                inspect_bitcoin_pilot(new_path)
            upgraded["transactions"][1]["outputs"][0]["value_sat"] = "25"
            upgraded["transactions"][1]["inputs"][0]["spent_outpoint"]["vout"] = 1
            write_private(upgraded, new_path)
            with self.assertRaisesRegex(ValueError, "raw transaction input mismatch"):
                inspect_bitcoin_pilot(new_path)
            upgraded["transactions"][1]["inputs"][0]["spent_outpoint"]["vout"] = 0
            upgraded["transactions"][1]["raw_transaction_hex"] = upgraded["transactions"][1]["raw_transaction_hex"][:-2] + "01"
            write_private(upgraded, new_path)
            with self.assertRaisesRegex(ValueError, "raw transaction txid mismatch"):
                inspect_bitcoin_pilot(new_path)

    def test_parser_accepts_segwit_and_rejects_malformed_bodies(self):
        _, _, _, coinbase, _ = fixture()
        self.assertEqual(parse_transaction(coinbase.hex())["txid"], txid(coinbase))
        base = (bytes.fromhex("0200000001") + bytes.fromhex("11" * 32)
                + bytes.fromhex("0000000000ffffffff01") + (10).to_bytes(8, "little")
                + bytes.fromhex("015100000000"))
        witness = base[:4] + bytes.fromhex("0001") + base[4:-4] + bytes.fromhex("010100") + base[-4:]
        parsed = parse_transaction(witness.hex())
        self.assertTrue(parsed["has_witness"])
        self.assertEqual(parsed["txid"], txid(base))
        for bad in (coinbase.hex()[:-2], coinbase.hex() + "00", "00", "zz", "00" * 500_001):
            with self.assertRaises(ValueError):
                parse_transaction(bad)
        noncanonical = coinbase[:4] + bytes.fromhex("fdfc00") + coinbase[5:]
        with self.assertRaisesRegex(ValueError, "noncanonical"):
            parse_transaction(noncanonical.hex())


if __name__ == "__main__":
    unittest.main()
