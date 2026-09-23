import unittest

from service.ml_validation import confusion_metrics, validate_holdout


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


if __name__ == "__main__":
    unittest.main()
