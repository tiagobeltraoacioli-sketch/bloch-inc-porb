import unittest
from dataclasses import replace
from datetime import datetime, timedelta, timezone

from service.ml_research import ResearchExample
from service.ml_walk_forward import WalkForwardWindow, evaluate_walk_forward


START = datetime(2026, 8, 1, tzinfo=timezone.utc)


def stamp(day):
    return (START + timedelta(days=day)).isoformat().replace("+00:00", "Z")


def sample():
    return [ResearchExample(
        case_id=f"synthetic-{index}", entity_id=f"entity-{index}",
        observed_at=stamp(index), feature_as_of=stamp(index), reviewed_at=stamp(index + 1),
        chain="ethereum", asset_id="eth", label=index % 2, reviewed=True,
        features={"activity": float(index), "pattern": float(index % 2)},
    ) for index in range(30)]


WINDOWS = [WalkForwardWindow(stamp(10), stamp(20), 3),
           WalkForwardWindow(stamp(20), stamp(30), 3)]


def run(rows, windows=WINDOWS):
    return evaluate_walk_forward(rows, windows=windows, evaluation_at=stamp(32),
                                 feature_names=["activity", "pattern"])


class WalkForwardTest(unittest.TestCase):
    def test_disjoint_windows_report_calibration_without_case_predictions(self):
        report = run(sample())
        self.assertEqual(report["status"], "walk_forward_research_only_not_aml_validated")
        self.assertEqual([fold["result"]["holdout"]["test_cases"] for fold in report["windows"]], [10, 10])
        self.assertEqual([fold["result"]["holdout"]["train_cases"] for fold in report["windows"]], [9, 19])
        for fold in report["windows"]:
            metrics = fold["result"]["metrics"]
            self.assertEqual(sum(row["count"] for row in metrics["calibration"]["bins"]), 10)
            self.assertIn("feature_shift_standardized_mean", metrics)
            self.assertNotIn("predictions", fold["result"])

    def test_late_review_cannot_enter_earlier_training(self):
        rows = sample()
        rows[0] = replace(rows[0], reviewed_at=stamp(15))
        report = run(rows)
        self.assertEqual(report["windows"][0]["outcomes_excluded_from_training_as_immature"], 2)
        self.assertEqual(report["windows"][0]["result"]["holdout"]["train_cases"], 8)
        self.assertEqual(report["windows"][1]["result"]["holdout"]["train_cases"], 19)

    def test_future_features_unmatured_test_and_overlapping_windows_rejected(self):
        rows = sample()
        with self.assertRaisesRegex(ValueError, "features must be available"):
            run(rows[:1] + [replace(rows[1], feature_as_of=stamp(3))] + rows[2:])
        with self.assertRaisesRegex(ValueError, "outcomes not reviewed"):
            run(rows[:-1] + [replace(rows[-1], reviewed_at=stamp(33))])
        with self.assertRaisesRegex(ValueError, "nonoverlapping"):
            run(rows, [WINDOWS[0], WalkForwardWindow(stamp(19), stamp(30), 3)])

    def test_entity_leakage_rejected_in_each_fold(self):
        rows = sample()
        rows[10] = replace(rows[10], entity_id=rows[0].entity_id)
        with self.assertRaisesRegex(ValueError, "entity-disjoint"):
            run(rows)


if __name__ == "__main__":
    unittest.main()
