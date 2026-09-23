import json
import os
import tempfile
import unittest
from pathlib import Path

from service.bitcoin_pilot import collect, write_private


BLOCK, COINBASE, SPEND, PREVIOUS = (letter * 64 for letter in "abcd")


def source(*, bad_status=False, reorg=False, bad_output=False):
    calls = []
    def get(path):
        calls.append(path)
        if path == "/blocks/tip/height":
            return "1000" if calls.count(path) == 1 else "1001"
        if path == "/block-height/995":
            return BLOCK if calls.count(path) == 1 or not reorg else "e" * 64
        if path == f"/block/{BLOCK}":
            return {"id": BLOCK, "height": 995, "tx_count": 2, "merkle_root": "f" * 64}
        if path == f"/block/{BLOCK}/status":
            return {"in_best_chain": not (reorg and calls.count(path) > 1)}
        if path == f"/block/{BLOCK}/txid/0":
            return COINBASE
        if path == f"/block/{BLOCK}/txid/1":
            return SPEND
        if path == f"/tx/{COINBASE}":
            return {"txid": COINBASE, "status": {"confirmed": True, "block_hash": BLOCK,
                    "block_height": 995}, "vin": [{"is_coinbase": True}],
                    "vout": [{"value": 50, "scriptpubkey": "51"},
                             {"value": 0, "scriptpubkey": "6a"}]}
        if path == f"/tx/{SPEND}":
            return {"txid": SPEND, "status": {"confirmed": True,
                    "block_hash": "e" * 64 if bad_status else BLOCK, "block_height": 995},
                    "vin": [{"is_coinbase": False, "txid": PREVIOUS, "vout": 2}],
                    "vout": [{"value": -1 if bad_output else 25, "scriptpubkey": "0014" + "a" * 40,
                              "scriptpubkey_address": "bc1qexampleaddress00000000000000000"}]}
        raise AssertionError(path)
    return get, calls


class BitcoinPilotTest(unittest.TestCase):
    def test_bounded_block_and_exact_outputs_with_no_sender(self):
        get, calls = source()
        sample = collect(min_confirmations=6, tx_limit=2, get=get)
        self.assertEqual(sample["block_height"], 995)
        self.assertEqual(sample["confirmations_source_reported"], 7)
        self.assertEqual(sample["sampled_transactions"], 2)
        self.assertEqual(sample["sampled_outputs"], 3)
        self.assertEqual(sample["sampled_spent_outpoint_references"], 1)
        self.assertEqual(sample["transactions"][0]["outputs"][1]["value_sat"], "0")
        self.assertEqual(sample["transactions"][1]["inputs"][0]["spent_outpoint"],
                         {"txid": PREVIOUS, "vout": 2})
        self.assertFalse(sample["transactions"][1]["single_sender_inferred"])
        self.assertFalse(sample["merkle_inclusion_independently_verified"])
        self.assertEqual(calls.count(f"/block/{BLOCK}/status"), 2)
        with tempfile.TemporaryDirectory() as temporary:
            path = Path(temporary) / "private" / "bitcoin-pilot.json"
            digest = write_private(sample, path)
            self.assertEqual(len(digest), 64)
            self.assertEqual(os.stat(path).st_mode & 0o777, 0o600)
            self.assertEqual(os.stat(path.parent).st_mode & 0o777, 0o700)
            self.assertEqual(json.loads(path.read_text())["sampled_outputs"], 3)

    def test_rejects_transaction_from_different_block(self):
        get, _ = source(bad_status=True)
        with self.assertRaisesRegex(ValueError, "selected block"):
            collect(min_confirmations=6, tx_limit=2, get=get)

    def test_rejects_changed_best_chain(self):
        get, _ = source(reorg=True)
        with self.assertRaisesRegex(ValueError, "changed"):
            collect(min_confirmations=6, tx_limit=2, get=get)

    def test_rejects_invalid_output_and_unbounded_requests(self):
        get, _ = source(bad_output=True)
        with self.assertRaisesRegex(ValueError, "satoshis"):
            collect(min_confirmations=6, tx_limit=2, get=get)
        for kwargs in ({"tx_limit": 6}, {"min_confirmations": 0}, {"tx_limit": True}):
            with self.assertRaises(ValueError):
                collect(get=lambda path: None, **kwargs)


if __name__ == "__main__":
    unittest.main()
