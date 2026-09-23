import json
import os
import tempfile
import unittest
from pathlib import Path

from service.structural_monitor import (compare_histograms, read_private_histogram,
                                        write_private_report)


def histogram(digest, counts=(10, 5), suppressed=2, unrepresented=3):
    cells = [
        {"input_log2_bin": 1, "output_log2_bin": 2, "created_value_log10_bin": 3, "transaction_count": counts[0]},
        {"input_log2_bin": 2, "output_log2_bin": 1, "created_value_log10_bin": 4, "transaction_count": counts[1]},
    ]
    return {
        "status": "privacy_reduced_structural_histogram",
        "source_sample_sha256": digest * 64,
        "source_complete": False,
        "sampled_transactions": sum(counts) + suppressed + unrepresented,
        "included_transactions": sum(counts),
        "suppressed_transactions": suppressed,
        "unrepresented_transactions": unrepresented,
        "min_cell_count": 5,
        "cells": cells,
        "identifiers_included": False,
    }


class StructuralMonitorTest(unittest.TestCase):
    def test_comparison_is_aggregate_and_bounded(self):
        reference = histogram("a")
        current = histogram("b", (5, 15), suppressed=4, unrepresented=1)
        report = compare_histograms(reference, current)
        self.assertEqual(report["reference"]["released_fraction"], 0.75)
        self.assertEqual(report["current"]["sampled_transactions"], 25)
        self.assertGreater(report["distribution_comparison"]["jensen_shannon_divergence_bits"], 0)
        self.assertLessEqual(report["distribution_comparison"]["total_variation_distance"], 1)
        self.assertFalse(report["production_ready"])
        self.assertEqual(report["wallet_scores_computed"], 0)
        self.assertFalse(report["comparability"]["temporal_trend_supported_by_monitor"])
        self.assertEqual(report["comparability"]["external_declarations"]["disjoint_transaction_sets"],
                         "not_supplied")
        self.assertFalse(report["comparability"]["sampling_confidence_interval_available"])
        text = json.dumps(report)
        self.assertNotIn("input_log2_bin", text)
        self.assertNotIn("source_sample_sha256", text)

    def test_identical_distributions_have_zero_distance(self):
        report = compare_histograms(histogram("a"), histogram("b"))
        self.assertEqual(report["distribution_comparison"]["jensen_shannon_divergence_bits"], 0)
        self.assertEqual(report["distribution_comparison"]["total_variation_distance"], 0)

    def test_suppression_sensitivity_is_deterministic_and_conservative(self):
        reference = histogram("a", counts=(10, 5), suppressed=2, unrepresented=3)
        current = histogram("b", counts=(5, 15), suppressed=4, unrepresented=1)
        report = compare_histograms(reference, current)
        distance = report["distribution_comparison"]["total_variation_distance"]
        bounds = report["distribution_comparison"]["true_shape_tv_suppression_sensitivity"]
        uncertainty_budget = 2 / 20 + 4 / 25
        self.assertAlmostEqual(bounds["lower_bound"], max(0, distance - uncertainty_budget), places=5)
        self.assertAlmostEqual(bounds["upper_bound"], min(1, distance + uncertainty_budget), places=5)
        self.assertFalse(bounds["sampling_uncertainty_included"])

    def test_external_comparability_is_declared_only_and_schema_limited(self):
        declarations = {
            "same_chain_network": True,
            "same_sampling_frame": True,
            "same_extractor_version": True,
            "nonoverlapping_time_windows": True,
            "disjoint_transaction_sets": True,
            "independent_source_reconciliation": True,
        }
        report = compare_histograms(histogram("a"), histogram("b"), comparison_evidence=declarations)
        self.assertTrue(report["comparability"]["all_external_gates_declared_yes"])
        self.assertFalse(report["comparability"]["external_declarations_independently_verified"])
        self.assertFalse(report["comparability"]["temporal_trend_supported_by_monitor"])
        with self.assertRaisesRegex(ValueError, "evidence fields"):
            compare_histograms(histogram("a"), histogram("b"),
                               comparison_evidence={"wallet": "private-address"})
        with self.assertRaisesRegex(ValueError, "booleans"):
            compare_histograms(histogram("a"), histogram("b"),
                               comparison_evidence={"disjoint_transaction_sets": "yes"})

    def test_rejects_invalid_accounting_and_small_cells(self):
        bad = histogram("b")
        bad["cells"][0]["transaction_count"] = 4
        with self.assertRaises(ValueError):
            compare_histograms(histogram("a"), bad)
        bad = histogram("b")
        bad["sampled_transactions"] += 1
        with self.assertRaises(ValueError):
            compare_histograms(histogram("a"), bad)

    def test_rejects_identifier_fields_and_incompatible_provenance(self):
        bad = histogram("b")
        bad["cells"][0]["wallet"] = "private-wallet"
        with self.assertRaises(ValueError):
            compare_histograms(histogram("a"), bad)
        bad = histogram("b")
        bad["wallet"] = "private-wallet"
        with self.assertRaises(ValueError):
            compare_histograms(histogram("a"), bad)
        bad = histogram("b")
        bad["min_cell_count"] = 6
        with self.assertRaises(ValueError):
            compare_histograms(histogram("a"), bad)
        with self.assertRaises(ValueError):
            compare_histograms(histogram("a"), histogram("a"))

    def test_private_io_is_bounded_and_atomic(self):
        with tempfile.TemporaryDirectory() as temporary:
            reference = Path(temporary) / "reference.json"
            reference.write_text(json.dumps(histogram("a")))
            self.assertEqual(read_private_histogram(reference)["sampled_transactions"], 20)
            reference.write_bytes(b" " * 2_000_001)
            with self.assertRaisesRegex(ValueError, "byte bound"):
                read_private_histogram(reference)
            output = Path(temporary) / "private" / "report.json"
            write_private_report(compare_histograms(histogram("a"), histogram("b")), output)
            self.assertEqual(os.stat(output).st_mode & 0o777, 0o600)
            self.assertEqual(os.stat(output.parent).st_mode & 0o777, 0o700)


if __name__ == "__main__":
    unittest.main()
