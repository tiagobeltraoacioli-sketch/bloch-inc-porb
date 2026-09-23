import unittest

from service.ml_validation import (calibration_summary, confusion_metrics,
                                   distribution_shift, validate_holdout, wilson_interval)


class ModelValidationTest(unittest.TestCase):
    def test_temporal_entity_disjoint_holdout(self):
        records = [
            {"case_id": "a", "entity_id": "e1", "observed_at": "2026-01-01T00:00:00Z", "label": 1, "reviewed": True},
            {"case_id": "b", "entity_id": "e2", "observed_at": "2026-06-01T00:00:00Z", "label": 0, "reviewed": True},
        ]
        manifest = validate_holdout(records, "2026-03-01T00:00:00Z")
        self.assertEqual((manifest["train_cases"], manifest["test_cases"]), (1, 1))
        records[1]["entity_id"] = "e1"
        with self.assertRaises(ValueError):
            validate_holdout(records, "2026-03-01T00:00:00Z")

    def test_unreviewed_labels_are_rejected(self):
        records = [
            {"case_id": "a", "entity_id": "e1", "observed_at": "2026-01-01T00:00:00Z", "label": 1, "reviewed": False},
            {"case_id": "b", "entity_id": "e2", "observed_at": "2026-06-01T00:00:00Z", "label": 0, "reviewed": True},
        ]
        with self.assertRaises(ValueError):
            validate_holdout(records, "2026-03-01T00:00:00Z")

    def test_metrics_do_not_invent_undefined_precision(self):
        result = confusion_metrics([1, 0], [0, 0])
        self.assertIsNone(result["precision"])
        self.assertEqual(result["recall"], 0)

    def test_calibration_counts_empty_bins_and_rejects_invalid_probabilities(self):
        summary = calibration_summary([0, 1], [0.1, 0.9], bins=5)
        self.assertEqual(sum(row["count"] for row in summary["bins"]), 2)
        self.assertIsNone(summary["bins"][2]["observed_rate"])
        self.assertAlmostEqual(summary["expected_calibration_error"], 0.1)
        with self.assertRaises(ValueError):
            calibration_summary([1], [float("nan")])

    def test_wilson_interval_preserves_small_sample_uncertainty(self):
        low, high = wilson_interval(1, 2)
        self.assertLess(low, 0.1)
        self.assertGreater(high, 0.9)
        with self.assertRaises(ValueError):
            wilson_interval(0, 0)

    def test_distribution_shift_uses_training_edges_and_detects_out_of_range_values(self):
        stable = distribution_shift([0, 1, 2, 3, 4], [0, 1, 2, 3, 4])
        shifted = distribution_shift([0, 1, 2, 3, 4], [-100, 100])
        self.assertAlmostEqual(stable["jensen_shannon_divergence_bits"], 0)
        self.assertEqual(shifted["out_of_train_range_test_count"], 2)
        self.assertEqual(shifted["train_bin_counts"], stable["train_bin_counts"])
        self.assertEqual(stable["train_bin_counts"][0], 0)
        self.assertEqual(stable["train_bin_counts"][-1], 0)
        self.assertEqual(shifted["test_bin_counts"][0], 1)
        self.assertEqual(shifted["test_bin_counts"][-1], 1)
        self.assertGreater(shifted["jensen_shannon_divergence_bits"], 0)
        self.assertNotIn("bin_edges", shifted)

    def test_distribution_shift_rejects_invalid_values(self):
        with self.assertRaises(ValueError):
            distribution_shift([0, float("nan")], [1])
        with self.assertRaises(ValueError):
            distribution_shift([0], [float("inf")])
        with self.assertRaises(ValueError):
            distribution_shift([0], [])


if __name__ == "__main__":
    unittest.main()
