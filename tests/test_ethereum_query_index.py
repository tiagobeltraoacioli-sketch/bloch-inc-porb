import json
import os
import tempfile
import unittest
from pathlib import Path

from service.ethereum_pilot import collect, write_private
from service.ethereum_query_index import build_index, query_address, query_transaction
from tests.test_ethereum_pilot import TX1, TX2, fixture


SENDER = "0x" + "1" * 40
DESTINATION = "0x" + "2" * 40


class EthereumQueryIndexTest(unittest.TestCase):
    def sample(self, directory):
        sample = Path(directory) / "sample"
        manifest, records = collect(limit=2, fetch=fixture, rpc_url="https://rpc.example.invalid/secret")
        write_private(manifest, records, sample)
        return sample, records

    def test_private_index_filters_asset_direction_and_transaction(self):
        with tempfile.TemporaryDirectory() as temporary:
            sample, _ = self.sample(temporary)
            index = Path(temporary) / "index" / "ethereum.sqlite"
            metadata = build_index(sample, index)
            self.assertEqual(metadata["movement_counts"], {"eth": 1, "usdt": 1, "usdc": 0})
            self.assertFalse(metadata["independent_finality_reconciled"])
            self.assertEqual(os.stat(index).st_mode & 0o777, 0o600)
            inbound = query_address(index, DESTINATION.upper().replace("0X", "0x"), asset="usdt", direction="incoming")
            self.assertEqual(len(inbound["movements"]), 1)
            self.assertEqual(inbound["movements"][0]["amount_base_units"], "25")
            self.assertEqual(inbound["provenance"]["source_host"], "rpc.example.invalid")
            self.assertNotIn("secret", str(inbound))
            self.assertEqual(len(query_address(index, SENDER, asset="usdt", direction="outgoing")["movements"]), 1)
            self.assertEqual(len(query_address(index, SENDER, asset="usdc")["movements"]), 0)
            self.assertEqual(len(query_address(index, DESTINATION, asset="eth")["movements"]), 1)
            first = query_transaction(index, TX1, limit=1)
            self.assertIsNotNone(first["next_cursor"])
            second = query_transaction(index, TX1, cursor=first["next_cursor"], limit=1)
            self.assertEqual(len(second["movements"]), 1)
            self.assertIsNone(second["next_cursor"])
            self.assertEqual(query_transaction(index, TX2)["movements"], [])

    def test_digest_mismatch_preserves_previous_index(self):
        with tempfile.TemporaryDirectory() as temporary:
            sample, _ = self.sample(temporary)
            index = Path(temporary) / "ethereum.sqlite"
            build_index(sample, index)
            before = index.read_bytes()
            with (sample / "ethereum-pilot.jsonl").open("ab") as handle:
                handle.write(b"tampered\n")
            with self.assertRaisesRegex(ValueError, "digest"):
                build_index(sample, index)
            self.assertEqual(index.read_bytes(), before)

    def test_rehashed_invalid_native_index_is_rejected(self):
        with tempfile.TemporaryDirectory() as temporary:
            sample, records = self.sample(temporary)
            index = Path(temporary) / "ethereum.sqlite"
            manifest = json.loads((sample / "ethereum-pilot-manifest.json").read_text())
            native = next(row for row in records if row["record_type"] == "normalized_movement" and row["asset_id"] == "eth")
            native["event_index"] = 9
            # Recompute the key so the source artifact is internally digest-consistent.
            from service.normalization import Movement
            native["event_key"] = Movement(**{name: native[name] for name in Movement.__dataclass_fields__}).key
            write_private(manifest, records, sample)
            with self.assertRaisesRegex(ValueError, "native event index"):
                build_index(sample, index)

    def test_query_inputs_are_bounded(self):
        with tempfile.TemporaryDirectory() as temporary:
            sample, _ = self.sample(temporary)
            index = Path(temporary) / "ethereum.sqlite"
            build_index(sample, index)
            for bad in (0, 101, True):
                with self.assertRaises(ValueError):
                    query_address(index, SENDER, asset="eth", limit=bad)
            for bad in (-1, True):
                with self.assertRaises(ValueError):
                    query_transaction(index, TX1, cursor=bad)
            with self.assertRaises(ValueError):
                query_address(index, "invalid", asset="eth")
            with self.assertRaises(ValueError):
                query_address(index, SENDER, asset="not-token")
            with self.assertRaises(ValueError):
                query_address(index, SENDER, asset="eth", direction="reverse")
            with self.assertRaises(ValueError):
                query_transaction(index, "not-a-txid")


if __name__ == "__main__":
    unittest.main()
