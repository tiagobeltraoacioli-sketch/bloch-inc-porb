"""A complete UTXO snapshot must be anchored before any global script ranking."""

import json
import sqlite3
import tempfile
import unittest
from pathlib import Path

from service.bitcoin_utxo_ranking import rank_snapshot


class BitcoinUtxoRankingTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        root = Path(self.temp.name)
        self.sqlite = root / "utxos.sqlite"
        self.snapshot = root / "utxos.dat"
        self.metadata = root / "dump.json"
        self.chain = root / "chain.json"
        self.hash = "ab" * 32
        with sqlite3.connect(self.sqlite) as db:
            db.execute("CREATE TABLE utxos(txid TEXT, vout INT, value INT, coinbase INT, height INT, scriptpubkey TEXT)")
            db.executemany("INSERT INTO utxos VALUES (?, ?, ?, ?, ?, ?)", [
                ("01", 0, 300, 0, 10, "0014" + "11" * 20),
                ("02", 0, 400, 0, 11, "0014" + "11" * 20),
                ("03", 0, 650, 0, 12, "5120" + "22" * 32),
            ])
        self.snapshot.write_bytes(b"utxo\xff" + (2).to_bytes(2, "little")
                                  + bytes.fromhex("f9beb4d9")
                                  + bytes.fromhex(self.hash)[::-1]
                                  + (3).to_bytes(8, "little"))
        self.metadata.write_text(json.dumps({"base_hash": self.hash,
                                             "base_height": 12, "coins_written": 3}))
        self.chain.write_text(json.dumps({"chain": "main", "blocks": 12,
                                          "initialblockdownload": False}))

    def rank(self):
        return rank_snapshot(self.sqlite, self.snapshot, self.metadata, self.chain)

    def test_exact_script_aggregation_and_anchor(self):
        result = self.rank()
        self.assertEqual(result["base_hash"], self.hash)
        self.assertEqual(result["snapshot_total_sats"], "1350")
        self.assertEqual([row["amount_base_units"] for row in result["rows"]], ["700", "650"])
        self.assertEqual(result["rows"][0]["utxo_count"], 2)
        self.assertTrue(result["network_wide_script_discovery_complete"])
        self.assertIsNone(result["rows"][0]["address"])

    def test_incomplete_sync_or_partial_conversion_is_rejected(self):
        self.chain.write_text(json.dumps({"chain": "main", "blocks": 12,
                                          "initialblockdownload": True}))
        with self.assertRaisesRegex(ValueError, "validation"):
            self.rank()
        self.chain.write_text(json.dumps({"chain": "main", "blocks": 12,
                                          "initialblockdownload": False}))
        with sqlite3.connect(self.sqlite) as db:
            db.execute("DELETE FROM utxos WHERE txid='03'")
        with self.assertRaisesRegex(ValueError, "count"):
            self.rank()

    def test_mismatched_snapshot_header_is_rejected(self):
        self.metadata.write_text(json.dumps({"base_hash": "cd" * 32,
                                             "base_height": 12, "coins_written": 3}))
        with self.assertRaisesRegex(ValueError, "header"):
            self.rank()


if __name__ == "__main__":
    unittest.main()
