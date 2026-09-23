"""Offline model-evaluation gates; no production model or labels are bundled."""

import hashlib
import json
import math
from datetime import datetime


def validate_holdout(records, cutoff):
    """Reject label leakage and return a reproducible train/test manifest."""
    boundary = datetime.fromisoformat(cutoff.replace("Z", "+00:00"))
    if boundary.tzinfo is None:
        raise ValueError("cutoff must be timezone-aware")
    seen = set()
    train_entities = set()
    test_entities = set()
    train = []
    test = []
    for record in records:
        if set(record) != {"case_id", "entity_id", "observed_at", "label", "reviewed"}:
            raise ValueError("unexpected or missing label field")
        if record["reviewed"] is not True or type(record["label"]) is not int or record["label"] not in (0, 1):
            raise ValueError("labels must be independently reviewed binary outcomes")
        if not isinstance(record["case_id"], str) or not record["case_id"] or record["case_id"] in seen:
            raise ValueError("case IDs must be unique")
        if not isinstance(record["entity_id"], str) or not record["entity_id"]:
            raise ValueError("entity ID required")
        observed = datetime.fromisoformat(record["observed_at"].replace("Z", "+00:00"))
        if observed.tzinfo is None:
            raise ValueError("observation must be timezone-aware")
        seen.add(record["case_id"])
        if observed < boundary:
            train.append(record)
            train_entities.add(record["entity_id"])
        else:
            test.append(record)
            test_entities.add(record["entity_id"])
    if not train or not test or train_entities & test_entities:
        raise ValueError("train/test must be nonempty and entity-disjoint")
    canonical = json.dumps(sorted(records, key=lambda item: item["case_id"]), sort_keys=True, separators=(",", ":"))
    return {
        "cutoff": cutoff,
        "train_cases": len(train),
        "test_cases": len(test),
        "train_positive": sum(item["label"] for item in train),
        "test_positive": sum(item["label"] for item in test),
        "label_manifest_sha256": hashlib.sha256(canonical.encode()).hexdigest(),
        "status": "split_validated_not_model_trained",
    }


def confusion_metrics(labels, predictions):
    """Report counts and defined metrics without hiding a zero denominator."""
    if len(labels) != len(predictions) or not labels:
        raise ValueError("nonempty equal-length labels and predictions required")
    if any(type(value) is not int or value not in (0, 1) for value in list(labels) + list(predictions)):
        raise ValueError("binary values required")
    tp = sum(y == 1 and p == 1 for y, p in zip(labels, predictions))
    fp = sum(y == 0 and p == 1 for y, p in zip(labels, predictions))
    tn = sum(y == 0 and p == 0 for y, p in zip(labels, predictions))
    fn = sum(y == 1 and p == 0 for y, p in zip(labels, predictions))
    return {
        "tp": tp, "fp": fp, "tn": tn, "fn": fn,
        "precision": tp / (tp + fp) if tp + fp else None,
        "recall": tp / (tp + fn) if tp + fn else None,
        "false_positive_rate": fp / (fp + tn) if fp + tn else None,
    }


def calibration_summary(labels, probabilities, *, bins=5):
    """Return aggregate reliability counts without exposing case predictions."""
    if len(labels) != len(probabilities) or not labels or not 2 <= bins <= 20:
        raise ValueError("nonempty equal-length observations and 2-20 bins required")
    if any(type(label) is not int or label not in (0, 1) for label in labels):
        raise ValueError("binary labels required")
    if any(type(value) not in (int, float) or not math.isfinite(value) or not 0 <= value <= 1
           for value in probabilities):
        raise ValueError("finite probabilities in [0, 1] required")
    groups = [[] for _ in range(bins)]
    for label, probability in zip(labels, probabilities):
        groups[min(int(probability * bins), bins - 1)].append((label, probability))
    rows = []
    for index, group in enumerate(groups):
        count = len(group)
        rows.append({
            "lower": index / bins,
            "upper": (index + 1) / bins,
            "count": count,
            "mean_probability": sum(value for _, value in group) / count if count else None,
            "observed_rate": sum(label for label, _ in group) / count if count else None,
        })
    error = sum(row["count"] * abs(row["mean_probability"] - row["observed_rate"])
                for row in rows if row["count"]) / len(labels)
    return {"bins": rows, "expected_calibration_error": error,
            "warning": "descriptive_holdout_only_not_calibrated_probability"}


def wilson_interval(successes, total, *, z=1.959963984540054):
    """Descriptive binomial interval; sampling bias is outside its scope."""
    if type(successes) is not int or type(total) is not int or not 0 <= successes <= total or total < 1:
        raise ValueError("valid nonempty count required")
    fraction = successes / total
    adjustment = z * z / total
    center = (fraction + adjustment / 2) / (1 + adjustment)
    margin = z * math.sqrt(fraction * (1 - fraction) / total + adjustment / (4 * total)) / (1 + adjustment)
    return [max(0.0, center - margin), min(1.0, center + margin)]
