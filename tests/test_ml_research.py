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


if __name__ == "__main__":
    unittest.main()
