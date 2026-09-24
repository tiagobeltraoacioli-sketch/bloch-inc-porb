import json
import tempfile
import unittest
from pathlib import Path

from service.bloch_backfill import write_private
from service.bloch_graph_pilot import build_report
from tests.test_bloch_query_index import A, B, fixture


def graph_fixture(folder):
    records = fixture(folder)
    manifest = json.loads((folder / "bloch-sample-manifest.json").read_text())
    manifest["pages"] = 1
    write_private(manifest, records, folder)
    return records


class BlochGraphPilotTest(unittest.TestCase):
    def test_aggregate_graph_uses_only_consistent_sample_outpoints(self):
        with tempfile.TemporaryDirectory() as temporary:
            folder = Path(temporary)
            graph_fixture(folder)
            report = build_report(folder)
            self.assertEqual(report["sampled_finalized_transactions"], 2)
            self.assertEqual(report["within_sample_consistent_outpoint_links"], 1)
            self.assertEqual(report["spend_references_without_creation_in_sample"], 1)
            self.assertEqual(report["weak_transaction_components"], 1)
            self.assertEqual(report["largest_component_transactions"], 2)
            self.assertEqual(report["created_output_value_sat"]["total"], "150")
            self.assertEqual(report["created_script_reuse"]["distinct_script_hashes"], 2)
            self.assertFalse(report["wallet_ownership_inferred"])
            self.assertNotIn(A, json.dumps(report))
            self.assertNotIn(B, json.dumps(report))

    def test_nonmonotonic_or_conflicting_links_fail_closed(self):
        with tempfile.TemporaryDirectory() as temporary:
            folder = Path(temporary)
            records = graph_fixture(folder)
            manifest = json.loads((folder / "bloch-sample-manifest.json").read_text())
            records[2]["slot"] = 19
            write_private(manifest, records, folder)
            with self.assertRaisesRegex(ValueError, "conflicting Bloch within-sample outpoint link"):
                build_report(folder)
            records[2]["slot"] = 21
            records[2]["value_sat"] = "101"
            write_private(manifest, records, folder)
            with self.assertRaisesRegex(ValueError, "quality requires review"):
                build_report(folder)


if __name__ == "__main__":
    unittest.main()
