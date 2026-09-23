"""Research-only, reviewed-label baseline with strict split and reproducible metrics.

This is a training harness, not an AML score service. No real labels are bundled.
"""

from __future__ import annotations

import hashlib
import json
import math
from dataclasses import dataclass
from datetime import datetime

from service.ml_validation import confusion_metrics, validate_holdout


@dataclass(frozen=True)
class ResearchExample:
    case_id: str
    entity_id: str
    observed_at: str
    chain: str
    asset_id: str
    label: int
    reviewed: bool
    features: dict[str, float]


def sigmoid(value):
    if value >= 0:
        return 1 / (1 + math.exp(-value))
    numerator = math.exp(value)
    return numerator / (1 + numerator)


def precision_at_k(labels, probabilities, k):
    if not (1 <= k <= len(labels)):
        raise ValueError("review capacity out of range")
    ranked = sorted(range(len(labels)), key=lambda index: (-probabilities[index], index))[:k]
    return sum(labels[index] for index in ranked) / k


def train_reviewed_baseline(examples, *, cutoff, feature_names, review_capacity, epochs=400, learning_rate=0.1, l2=0.01):
    """Fit logistic baseline on reviewed data only; report held-out error evidence."""
    examples = tuple(examples)
    feature_names = tuple(feature_names)
    if len(examples) < 8 or not feature_names or len(feature_names) != len(set(feature_names)):
        raise ValueError("at least eight examples and unique features required")
    if not (1 <= epochs <= 2000 and 0 < learning_rate <= 1 and 0 <= l2 <= 1):
        raise ValueError("invalid training bounds")
    scope = {(item.chain, item.asset_id) for item in examples}
    if len(scope) != 1:
        raise ValueError("train one chain and asset at a time")
    for item in examples:
        if set(item.features) != set(feature_names):
            raise ValueError("missing or unexpected feature")
        if any(not isinstance(value, (int, float)) or isinstance(value, bool) or not math.isfinite(value) for value in item.features.values()):
            raise ValueError("features must be finite numbers")
    manifest = validate_holdout([
        {"case_id": item.case_id, "entity_id": item.entity_id, "observed_at": item.observed_at,
         "label": item.label, "reviewed": item.reviewed} for item in examples
    ], cutoff)
    boundary = datetime.fromisoformat(cutoff.replace("Z", "+00:00"))
    train = [item for item in examples if datetime.fromisoformat(item.observed_at.replace("Z", "+00:00")) < boundary]
    test = [item for item in examples if datetime.fromisoformat(item.observed_at.replace("Z", "+00:00")) >= boundary]
    if {item.label for item in train} != {0, 1} or {item.label for item in test} != {0, 1}:
        raise ValueError("both classes required in train and holdout")
    if not 1 <= review_capacity <= len(test):
        raise ValueError("review capacity must fit holdout")
    means = {name: sum(item.features[name] for item in train) / len(train) for name in feature_names}
    scales = {}
    for name in feature_names:
        variance = sum((item.features[name] - means[name]) ** 2 for item in train) / len(train)
        scales[name] = math.sqrt(variance) if variance > 0 else 1.0
    def vector(item):
        return [(item.features[name] - means[name]) / scales[name] for name in feature_names]
    train_vectors = [vector(item) for item in train]
    test_vectors = [vector(item) for item in test]
    weights = [0.0] * (len(feature_names) + 1)
    for _ in range(epochs):
        gradient = [0.0] * len(weights)
        for item, values in zip(train, train_vectors):
            difference = sigmoid(weights[0] + sum(weight * value for weight, value in zip(weights[1:], values))) - item.label
            gradient[0] += difference
            for index, value in enumerate(values, 1):
                gradient[index] += difference * value
        for index in range(len(weights)):
            penalty = l2 * weights[index] if index else 0
            weights[index] -= learning_rate * (gradient[index] / len(train) + penalty)
    probabilities = [sigmoid(weights[0] + sum(weight * value for weight, value in zip(weights[1:], values))) for values in test_vectors]
    labels = [item.label for item in test]
    predictions = [int(value >= 0.5) for value in probabilities]
    metrics = confusion_metrics(labels, predictions)
    metrics["brier_score"] = sum((probability - label) ** 2 for probability, label in zip(probabilities, labels)) / len(labels)
    metrics["precision_at_review_capacity"] = precision_at_k(labels, probabilities, review_capacity)
    metrics["review_capacity"] = review_capacity
    canonical = json.dumps({"features": feature_names, "train_ids": sorted(item.case_id for item in train),
                            "test_ids": sorted(item.case_id for item in test), "cutoff": cutoff}, sort_keys=True)
    model_manifest = hashlib.sha256(canonical.encode()).hexdigest()
    return {
        "status": "research_only_not_aml_validated",
        "chain": examples[0].chain, "asset_id": examples[0].asset_id,
        "feature_names": list(feature_names),
        "holdout": manifest,
        "model_manifest_sha256": model_manifest,
        "metrics": metrics,
        "limitations": ["no_production_promotion", "requires_real_independent_labels", "requires_calibration_and_external_validation"],
    }
