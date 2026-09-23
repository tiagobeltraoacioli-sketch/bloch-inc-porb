import tempfile
import unittest
from pathlib import Path

from service.bloch_backfill import write_private
from service.bloch_sample_analysis import analyze


class BlochSampleAnalysisTest(unittest.TestCase):
    def test_resolved_outpoints_are_only_within_the_bounded_sample(self):
        with tempfile.TemporaryDirectory() as temporary:
            folder = Path(temporary)
            manifest = {"source_id": "test", "source_complete": False, "finalized_transactions": 2,
                        "created_outputs": 1, "spent_outpoint_observations": 2}
            records = [
                {"record_type": "created_output_observation", "tx_id": "a", "event_index": 0, "script_hash": "s", "value_sat": "100"},
                {"record_type": "spent_outpoint_observation", "spending_tx_id": "b", "prior_tx_id": "a", "prior_vout": 0, "prior_script_hash": "s"},
                {"record_type": "spent_outpoint_observation", "spending_tx_id": "b", "prior_tx_id": "outside", "prior_vout": 1, "prior_script_hash": "t"},
            ]
            write_private(manifest, records, folder)
            report = analyze(folder / "bloch-sample.jsonl", folder / "bloch-sample-manifest.json")
            self.assertEqual(report["within_sample_spent_outpoints_resolved"], 1)
            self.assertEqual(report["within_sample_resolution_fraction"], 0.5)
            self.assertNotIn("outside", str(report))
            (folder / "bloch-sample.jsonl").write_text("tampered\n")
            with self.assertRaises(ValueError):
                analyze(folder / "bloch-sample.jsonl", folder / "bloch-sample-manifest.json")


if __name__ == "__main__":
    unittest.main()
