import json
import tempfile
import unittest
from pathlib import Path

from service.bitcoin_graph_pilot import build_report
from service.bitcoin_pilot import collect, write_private
from tests.test_bitcoin_pilot import COINBASE, SPEND, source


class BitcoinGraphPilotTest(unittest.TestCase):
    def sample(self, folder):
        get, _ = source()
        path = folder / "pilot.json"
        write_private(collect(min_confirmations=6, tx_limit=2, get=get), path)
        return path

    def test_observed_outpoint_graph_has_no_wallet_claim(self):
        with tempfile.TemporaryDirectory() as temporary:
            path = self.sample(Path(temporary))
            report = build_report(path)
            self.assertEqual(report["sampled_transactions"], 2)
            self.assertEqual(report["sampled_outputs"], 3)
            self.assertEqual(report["within_sample_outpoint_links"], 0)
            self.assertEqual(report["weak_transaction_components"], 2)
            self.assertEqual(report["created_output_value_sat"]["total"], "75")
            self.assertEqual(report["created_output_value_sat"]["zero_value_count"], 1)
            self.assertFalse(report["transaction_bodies_locally_verified_against_txids"])
            self.assertFalse(report["wallet_ownership_inferred"])
            self.assertNotIn(COINBASE, json.dumps(report))
            self.assertNotIn(SPEND, json.dumps(report))

    def test_within_sample_link_and_conflicts(self):
        with tempfile.TemporaryDirectory() as temporary:
            path = self.sample(Path(temporary))
            sample = json.loads(path.read_text())
            sample["transactions"][1]["inputs"][0]["spent_outpoint"] = {
                "txid": COINBASE, "vout": 0,
            }
            write_private(sample, path)
            report = build_report(path)
            self.assertEqual(report["within_sample_outpoint_links"], 1)
            self.assertEqual(report["weak_transaction_components"], 1)
            self.assertEqual(report["largest_component_transactions"], 2)
            sample["transactions"][1]["inputs"].append(sample["transactions"][1]["inputs"][0].copy())
            sample["sampled_spent_outpoint_references"] += 1
            write_private(sample, path)
            with self.assertRaisesRegex(ValueError, "duplicate Bitcoin spent outpoint"):
                build_report(path)

    def test_rejects_legacy_pilot_and_future_outpoint(self):
        with tempfile.TemporaryDirectory() as temporary:
            path = self.sample(Path(temporary))
            sample = json.loads(path.read_text())
            sample["transactions"][1]["inputs"][0]["spent_outpoint"] = {
                "txid": SPEND, "vout": 0,
            }
            write_private(sample, path)
            with self.assertRaisesRegex(ValueError, "outpoint order conflicts"):
                build_report(path)
            sample["schema_version"] = 1
            sample["merkle_inclusion_locally_verified"] = False
            sample.pop("block_header_hex")
            sample.pop("block_merkle_root_source_reported")
            for tx in sample["transactions"]:
                tx.pop("merkle_branch")
                tx.pop("merkle_position")
            write_private(sample, path)
            with self.assertRaisesRegex(ValueError, "schema-v2"):
                build_report(path)


if __name__ == "__main__":
    unittest.main()
