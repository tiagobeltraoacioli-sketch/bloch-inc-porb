import json
import tempfile
import unittest
from pathlib import Path

from service.aggregate_ml import fit_histogram
from service.bloch_backfill import write_private
from service.structural_histogram import build_histogram


class StructuralMLTest(unittest.TestCase):
    def fixture(self, folder):
        records = []
        for index in range(12):
            tx = f"private-tx-{index}"
            inputs = 1 if index < 6 else 8
            outputs = 1 if index < 6 else 2
            value = "100" if index < 6 else "100000"
            for input_index in range(inputs):
                records.append({"record_type": "spent_outpoint_observation", "spending_tx_id": tx,
                                "prior_tx_id": "private-prior", "prior_vout": input_index,
                                "prior_script_hash": "private-script"})
            for output_index in range(outputs):
                records.append({"record_type": "created_output_observation", "tx_id": tx,
                                "event_index": output_index, "script_hash": "private-script", "value_sat": value})
        manifest = {"source_id": "test", "source_complete": False, "finalized_transactions": 12,
                    "created_outputs": 18, "spent_outpoint_observations": 54}
        write_private(manifest, records, folder)
        return build_histogram(folder / "bloch-sample.jsonl", folder / "bloch-sample-manifest.json")

    def test_histogram_suppresses_identifiers_and_research_model_is_not_aml(self):
        with tempfile.TemporaryDirectory() as temporary:
            histogram = self.fixture(Path(temporary))
            self.assertEqual(histogram["included_transactions"], 12)
            self.assertEqual(histogram["unrepresented_transactions"], 0)
            self.assertEqual(len(histogram["cells"]), 2)
            self.assertNotIn("private-script", json.dumps(histogram))
            self.assertNotIn("private-tx", json.dumps(histogram))
            model = fit_histogram(histogram, clusters=2)
            self.assertEqual(model["status"], "unsupervised_structural_research_only")
            self.assertEqual(sorted(item["transactions"] for item in model["clusters"]), [6, 6])
            self.assertEqual(model["wallet_scores_computed"], 0)

    def test_small_cells_are_rejected_or_suppressed(self):
        with tempfile.TemporaryDirectory() as temporary:
            histogram = self.fixture(Path(temporary))
            histogram["cells"][0]["transaction_count"] = 1
            with self.assertRaises(ValueError):
                fit_histogram(histogram, clusters=2)

    def test_missing_structure_is_counted_separately_from_suppressed_cells(self):
        with tempfile.TemporaryDirectory() as temporary:
            folder = Path(temporary)
            self.fixture(folder)
            manifest = json.loads((folder / "bloch-sample-manifest.json").read_text())
            manifest["finalized_transactions"] = 13
            (folder / "bloch-sample-manifest.json").write_text(json.dumps(manifest))
            histogram = build_histogram(folder / "bloch-sample.jsonl", folder / "bloch-sample-manifest.json")
            self.assertEqual(histogram["included_transactions"], 12)
            self.assertEqual(histogram["suppressed_transactions"], 0)
            self.assertEqual(histogram["unrepresented_transactions"], 1)


if __name__ == "__main__":
    unittest.main()
