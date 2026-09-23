import unittest
from dataclasses import replace

from service.ml_research import ResearchExample, train_reviewed_baseline


def examples():
    result = []
    for index in range(24):
        label = index % 2
        result.append(ResearchExample(
            case_id=f"synthetic-{index}", entity_id=f"entity-{index}",
            observed_at=f"2026-09-{1+index:02d}T12:00:00Z", chain="ethereum", asset_id="eth",
            label=label, reviewed=True,
            features={"event_count": float(index + 1), "synthetic_pattern": float(label + index % 3 / 10)},
        ))
    return result


class ResearchModelTest(unittest.TestCase):
    def train(self, rows):
        return train_reviewed_baseline(rows, cutoff="2026-09-17T00:00:00Z",
                                       feature_names=["event_count", "synthetic_pattern"], review_capacity=4)

    def test_training_reports_holdout_metrics_without_aml_claim(self):
        report = self.train(examples())
        self.assertEqual(report["status"], "research_only_not_aml_validated")
        self.assertEqual(report["holdout"]["train_cases"], 16)
        self.assertEqual(report["holdout"]["test_cases"], 8)
        self.assertIn("precision_at_review_capacity", report["metrics"])
        self.assertNotIn("wallet_score", report)
        self.assertEqual(len(report["model_manifest_sha256"]), 64)

    def test_mixed_assets_unreviewed_labels_and_entity_leakage_are_rejected(self):
        rows = examples()
        with self.assertRaises(ValueError):
            self.train(rows[:-1] + [replace(rows[-1], asset_id="usdt")])
        with self.assertRaises(ValueError):
            self.train(rows[:-1] + [replace(rows[-1], reviewed=False)])
        with self.assertRaises(ValueError):
            self.train(rows[:-1] + [replace(rows[-1], entity_id=rows[0].entity_id)])

    def test_missing_and_nonfinite_features_are_rejected(self):
        rows = examples()
        with self.assertRaises(ValueError):
            self.train(rows[:-1] + [replace(rows[-1], features={"event_count": 1.0})])
        with self.assertRaises(ValueError):
            self.train(rows[:-1] + [replace(rows[-1], features={"event_count": float("nan"), "synthetic_pattern": 1.0})])

    def test_reference_uses_training_prevalence_and_reports_aggregate_drift(self):
        rows = examples()
        report = self.train(rows)
        reference = report["metrics"]["train_prevalence_reference"]
        self.assertEqual(reference["train_prevalence"], 0.5)
        self.assertAlmostEqual(reference["holdout_brier_score"], 0.25)
        uncertainty = report["metrics"]["paired_brier_delta_entity_bootstrap"]
        self.assertEqual(uncertainty["entity_count"], 8)
        self.assertEqual(len(uncertainty["interval95"]), 2)
        self.assertAlmostEqual(uncertainty["model_minus_reference_brier"],
                               report["metrics"]["brier_score"] - reference["holdout_brier_score"])
        drift = report["metrics"]["feature_distribution_shift"]["event_count"]
        self.assertEqual(drift["out_of_train_range_test_count"], 8)
        self.assertEqual(sum(drift["train_bin_counts"]), 16)
        self.assertEqual(sum(drift["test_bin_counts"]), 8)
        self.assertNotIn("case_id", str(report["metrics"]))

    def test_research_manifest_commits_to_features_and_lineage(self):
        rows = examples()
        original = self.train(rows)
        self.assertEqual(original["source_lineage"]["status"], "incomplete_unverifiable")
        changed_feature = rows[:-1] + [replace(rows[-1], features={
            "event_count": 999.0, "synthetic_pattern": rows[-1].features["synthetic_pattern"]})]
        self.assertNotEqual(original["model_manifest_sha256"],
                            self.train(changed_feature)["model_manifest_sha256"])
        declared = [replace(item, feature_as_of=item.observed_at,
                            feature_snapshot_sha256="a" * 64,
                            source_watermark=item.observed_at) for item in rows]
        declared_report = self.train(declared)
        self.assertEqual(declared_report["source_lineage"]["status"],
                         "declared_not_independently_verified")
        self.assertFalse(declared_report["source_lineage"]["historical_availability_proven"])
        self.assertNotEqual(original["model_manifest_sha256"],
                            declared_report["model_manifest_sha256"])


if __name__ == "__main__":
    unittest.main()
