import json
import os
import tempfile
import unittest
from pathlib import Path

from service.bitcoin_pilot import collect, write_private as write_pilot
from service.bitcoin_reconcile import reconcile, write_private
from test_bitcoin_pilot import source


class BitcoinReconcileTest(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory()
        self.addCleanup(self.temporary.cleanup)
        self.pilot = Path(self.temporary.name) / "private" / "bitcoin-pilot.json"
        self.primary_get, _ = source()
        self.sample = collect(min_confirmations=6, tx_limit=2, get=self.primary_get)
        write_pilot(self.sample, self.pilot)

    def test_second_operator_agreement_is_bounded_and_private(self):
        calls = []
        def second(path):
            calls.append(path)
            return self.primary_get(path)
        report = reconcile(self.pilot, get=second)
        self.assertTrue(report["block_hash_and_header_agree"])
        self.assertTrue(report["sampled_positions_and_merkle_proofs_agree"])
        self.assertEqual(report["sampled_transactions_compared"], 2)
        self.assertFalse(report["consensus_independently_validated"])
        self.assertNotIn(self.sample["transactions"][0]["txid"], json.dumps(report))
        self.assertEqual(calls.count("/blocks/tip/height"), 2)
        self.assertEqual(len([path for path in calls if path.endswith("/merkle-proof")]), 2)
        destination = Path(self.temporary.name) / "private" / "reconciliation.json"
        digest = write_private(report, destination)
        self.assertEqual(len(digest), 64)
        self.assertEqual(os.stat(destination).st_mode & 0o777, 0o600)

    def test_mismatch_and_legacy_sample_fail_closed(self):
        def changed_block(path):
            if path.startswith("/block-height/"):
                return "e" * 64
            return self.primary_get(path)
        with self.assertRaisesRegex(ValueError, "block hash differs"):
            reconcile(self.pilot, get=changed_block)
        def changed_position(path):
            if path.endswith("/txid/1"):
                return "e" * 64
            return self.primary_get(path)
        with self.assertRaisesRegex(ValueError, "transaction position differs"):
            reconcile(self.pilot, get=changed_position)
        legacy = dict(self.sample, schema_version=1)
        for key in ("block_header_hex", "header_hash_locally_verified", "merkle_inclusion_locally_verified"):
            legacy.pop(key)
        legacy["transactions"] = [{key: value for key, value in tx.items()
                                   if key not in ("merkle_branch", "merkle_position")}
                                  for tx in self.sample["transactions"]]
        write_pilot(legacy, self.pilot)
        with self.assertRaisesRegex(ValueError, "schema-v2"):
            reconcile(self.pilot, get=self.primary_get)


if __name__ == "__main__":
    unittest.main()
