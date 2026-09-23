import hashlib
import json
import os
import tempfile
import unittest
from pathlib import Path

from service.bitcoin_pilot import collect, write_private
from service.bitcoin_query_index import (build_index, query_output_address,
                                         query_script_sha256, query_transaction)
from tests.test_bitcoin_pilot import COINBASE, PREVIOUS, SPEND, source


ADDRESS = "bc1qexampleaddress00000000000000000"


class BitcoinQueryIndexTest(unittest.TestCase):
    def sample(self, directory):
        pilot = Path(directory) / "pilot" / "bitcoin-block-pilot.json"
        get, _ = source()
        write_private(collect(min_confirmations=6, tx_limit=2, get=get), pilot)
        return pilot

    def test_private_index_queries_exact_outputs_and_input_references(self):
        with tempfile.TemporaryDirectory() as temporary:
            pilot = self.sample(temporary)
            index = Path(temporary) / "index" / "bitcoin.sqlite"
            metadata = build_index(pilot, index)
            self.assertEqual(metadata["sampled_outputs"], 3)
            self.assertEqual(metadata["sampled_input_outpoint_references"], 1)
            self.assertFalse(metadata["sender_ownership_inferred"])
            self.assertFalse(metadata["unspent_status_queried"])
            self.assertEqual(os.stat(index).st_mode & 0o777, 0o600)
            self.assertEqual(os.stat(index.parent).st_mode & 0o777, 0o700)

            address = query_output_address(index, ADDRESS)
            self.assertEqual(len(address["observations"]), 1)
            output = address["observations"][0]
            self.assertEqual(output["kind"], "sampled_output")
            self.assertEqual(output["value_sat"], "25")
            self.assertEqual(output["txid"], SPEND)
            self.assertIsNone(output["prior_txid"])
            script_hash = hashlib.sha256(bytes.fromhex("0014" + "a" * 40)).hexdigest()
            self.assertEqual(output["script_sha256"], script_hash)
            self.assertEqual(query_script_sha256(index, script_hash)["observations"], [output])

            first = query_transaction(index, SPEND, limit=1)
            self.assertIsNotNone(first["next_cursor"])
            second = query_transaction(index, SPEND, cursor=first["next_cursor"], limit=1)
            self.assertEqual(len(second["observations"]), 1)
            self.assertIsNone(second["next_cursor"])
            self.assertEqual({row["kind"] for row in first["observations"] + second["observations"]},
                             {"sampled_output", "sampled_input_outpoint_reference"})
            prior = next(row for row in first["observations"] + second["observations"]
                         if row["kind"] == "sampled_input_outpoint_reference")
            self.assertEqual((prior["prior_txid"], prior["prior_vout"]), (PREVIOUS, 2))
            self.assertIsNone(prior["output_address"])
            self.assertEqual(query_transaction(index, COINBASE)["observations"][0]["kind"], "sampled_output")
            self.assertEqual(query_transaction(index, "e" * 64)["observations"], [])

    def test_rejects_unverified_schema_and_preserves_previous_index(self):
        with tempfile.TemporaryDirectory() as temporary:
            pilot = self.sample(temporary)
            index = Path(temporary) / "bitcoin.sqlite"
            build_index(pilot, index)
            before = index.read_bytes()
            sample = json.loads(pilot.read_text())
            sample["schema_version"] = 1
            sample["merkle_inclusion_locally_verified"] = False
            sample.pop("block_header_hex")
            sample.pop("block_merkle_root_source_reported")
            for tx in sample["transactions"]:
                tx.pop("merkle_branch")
                tx.pop("merkle_position")
            write_private(sample, pilot)
            with self.assertRaisesRegex(ValueError, "schema-v2"):
                build_index(pilot, index)
            self.assertEqual(index.read_bytes(), before)

    def test_rejects_malformed_source_reported_output_address(self):
        with tempfile.TemporaryDirectory() as temporary:
            pilot = self.sample(temporary)
            index = Path(temporary) / "bitcoin.sqlite"
            sample = json.loads(pilot.read_text())
            sample["transactions"][1]["outputs"][0]["source_reported_address"] = "bad address"
            write_private(sample, pilot)
            with self.assertRaisesRegex(ValueError, "output address"):
                build_index(pilot, index)
            self.assertFalse(index.exists())

    def test_bounded_inputs_and_private_artifact_byte_limit(self):
        with tempfile.TemporaryDirectory() as temporary:
            pilot = self.sample(temporary)
            index = Path(temporary) / "bitcoin.sqlite"
            build_index(pilot, index)
            for bad in (0, 101, True):
                with self.assertRaises(ValueError):
                    query_output_address(index, ADDRESS, limit=bad)
            for bad in (-1, True):
                with self.assertRaises(ValueError):
                    query_transaction(index, SPEND, cursor=bad)
            for method, value in ((query_output_address, "not valid"),
                                  (query_script_sha256, "not a digest"),
                                  (query_transaction, "not a txid")):
                with self.assertRaises(ValueError):
                    method(index, value)
            with pilot.open("ab") as handle:
                handle.write(b" " * 8_000_000)
            with self.assertRaisesRegex(ValueError, "byte bound"):
                build_index(pilot, index)


if __name__ == "__main__":
    unittest.main()
