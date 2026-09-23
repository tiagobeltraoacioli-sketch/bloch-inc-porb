import tempfile
import unittest
from pathlib import Path

from service.bloch_backfill import collect, write_private


TX1 = {
    "txid": "a" * 64, "block_id": "b" * 64, "height": 9, "slot": 20,
    "outputs": [{"value_sat": "100", "script_hash": "c" * 64}],
    "inputs": [{"txid": "d" * 64, "vout": 0, "script_hash": "e" * 64, "value_sat": "120"}],
}
TX2 = {
    "txid": "f" * 64, "block_id": "1" * 64, "height": 10, "slot": 21,
    "outputs": [{"value_sat": "80", "script_hash": "2" * 64}], "inputs": [],
}
CURSOR = "10-" + "1" * 64 + "-1"


def source(path):
    if path == "/health":
        return {"ok": True, "finalized_height": 9}
    if path == "/transactions?limit=1":
        return {"as_of_height": 10, "as_of_slot": 21, "transactions": [TX1], "next_cursor": CURSOR}
    if path.endswith("cursor=" + CURSOR):
        return {"as_of_height": 10, "as_of_slot": 21, "transactions": [TX2], "next_cursor": None}
    raise AssertionError(path)


class BlochBackfillTest(unittest.TestCase):
    def test_snapshot_pagination_keeps_only_finalized_observations(self):
        manifest, records = collect(pages=2, page_size=1, fetch=source)
        self.assertEqual(manifest["pages"], 2)
        self.assertEqual(manifest["finalized_transactions"], 1)
        self.assertEqual(manifest["created_outputs"], 1)
        self.assertEqual(manifest["spent_outpoint_observations"], 1)
        self.assertTrue(manifest["source_complete"])
        self.assertFalse(any(record["sender_ownership_asserted"] for record in records))
        with tempfile.TemporaryDirectory() as temporary:
            saved = write_private(manifest, records, Path(temporary) / "private")
            self.assertEqual(saved["record_count"], 2)
            self.assertEqual(len(saved["records_sha256"]), 64)

    def test_duplicate_page_is_rejected(self):
        def duplicate(path):
            value = source(path)
            if path.endswith("cursor=" + CURSOR):
                return {"as_of_height": 10, "as_of_slot": 21, "transactions": [TX1], "next_cursor": None}
            return value
        with self.assertRaises(ValueError):
            collect(pages=2, page_size=1, fetch=duplicate)

    def test_snapshot_change_is_rejected(self):
        def changed(path):
            value = source(path)
            if path.endswith("cursor=" + CURSOR):
                return dict(value, as_of_slot=22)
            return value
        with self.assertRaises(ValueError):
            collect(pages=2, page_size=1, fetch=changed)

    def test_large_response_retries_with_smaller_bounded_page(self):
        calls = []
        def oversized(path):
            calls.append(path)
            if path == "/health":
                return {"ok": True, "finalized_height": 9}
            if path == "/transactions?limit=4":
                raise ValueError("indexer response exceeds bound")
            if path == "/transactions?limit=2":
                return {"as_of_height": 10, "as_of_slot": 21, "transactions": [TX1], "next_cursor": CURSOR}
            raise AssertionError(path)
        manifest, records = collect(pages=1, page_size=4, fetch=oversized)
        self.assertEqual(manifest["response_bound_retries"], 1)
        self.assertEqual(manifest["page_limits_used"], [2])
        self.assertEqual(manifest["finalized_transactions"], 1)
        self.assertEqual(len(records), 2)
        self.assertEqual(calls, ["/health", "/transactions?limit=4", "/transactions?limit=2"])


if __name__ == "__main__":
    unittest.main()
