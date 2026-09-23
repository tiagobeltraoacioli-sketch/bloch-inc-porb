"""Research-only, reviewed-label baseline with strict split and reproducible metrics.

This is a training harness, not an AML score service. No real labels are bundled.
"""

from __future__ import annotations

import hashlib
import json
import math
import re
from dataclasses import dataclass
from datetime import datetime

from service.ml_validation import (calibration_summary, confusion_metrics,
                                   distribution_shift, validate_holdout, wilson_interval)
from service.ml_validation import paired_brier_entity_bootstrap


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
    feature_as_of: str | None = None
    reviewed_at: str | None = None
    feature_snapshot_sha256: str | None = None
    source_watermark: str | None = None


def _aware_time(value, field):
    if not isinstance(value, str):
        raise ValueError(f"{field} must be a timezone-aware ISO timestamp")
    try:
        parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError as error:
        raise ValueError(f"{field} must be a timezone-aware ISO timestamp") from error
    if parsed.tzinfo is None:
        raise ValueError(f"{field} must be timezone-aware")
    return parsed


def research_lineage_summary(examples):
    """Validate declared source lineage; never treat a declaration as proof."""
    examples = tuple(examples)
    declared = 0
    for item in examples:
        digest = item.feature_snapshot_sha256
        watermark = item.source_watermark
        if (digest is None) != (watermark is None):
            raise ValueError("snapshot digest and source watermark must be supplied together")
        if digest is None:
            continue
        if not isinstance(digest, str) or not re.fullmatch(r"[0-9a-f]{64}", digest):
            raise ValueError("feature snapshot must be a lowercase SHA-256 digest")
        observed = _aware_time(item.observed_at, "observed_at")
        available = _aware_time(item.feature_as_of, "feature_as_of")
        source_time = _aware_time(watermark, "source_watermark")
        if source_time > available or available > observed:
            raise ValueError("source watermark and features must predate observation")
        declared += 1
    return {
        "examples": len(examples),
        "declared_snapshot_count": declared,
        "missing_snapshot_count": len(examples) - declared,
        "status": ("declared_not_independently_verified" if declared == len(examples)
                   else "incomplete_unverifiable"),
        "historical_availability_proven": False,
    }


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


def top_k_positive_count(labels, probabilities, k):
    ranked = sorted(range(len(labels)), key=lambda index: (-probabilities[index], index))[:k]
    return sum(labels[index] for index in ranked)


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
    lineage = research_lineage_summary(examples)
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
    train_prevalence = sum(item.label for item in train) / len(train)
    prevalence_brier = sum((train_prevalence - label) ** 2 for label in labels) / len(labels)
    metrics["train_prevalence_reference"] = {
        "train_prevalence": train_prevalence,
        "holdout_brier_score": prevalence_brier,
        "brier_skill_vs_reference": 1 - metrics["brier_score"] / prevalence_brier,
        "warning": "descriptive_reference_not_evidence_of_operational_uplift",
    }
    metrics["paired_brier_delta_entity_bootstrap"] = paired_brier_entity_bootstrap(
        labels, probabilities, train_prevalence, [item.entity_id for item in test],
        seed=manifest["label_manifest_sha256"],
    )
    metrics["precision_at_review_capacity"] = precision_at_k(labels, probabilities, review_capacity)
    metrics["review_capacity"] = review_capacity
    metrics["precision_at_review_capacity_wilson95"] = wilson_interval(
        top_k_positive_count(labels, probabilities, review_capacity), review_capacity)
    metrics["reviewed_holdout_prevalence"] = sum(labels) / len(labels)
    metrics["reviewed_holdout_prevalence_wilson95"] = wilson_interval(sum(labels), len(labels))
    metrics["calibration"] = calibration_summary(labels, probabilities)
    metrics["feature_shift_standardized_mean"] = {
        name: sum(values[index] for values in test_vectors) / len(test_vectors)
        for index, name in enumerate(feature_names)
    }
    metrics["feature_distribution_shift"] = {
        name: distribution_shift([item.features[name] for item in train],
                                 [item.features[name] for item in test])
        for name in feature_names
    }
    canonical = json.dumps({
        "feature_names": feature_names, "cutoff": cutoff, "review_capacity": review_capacity,
        "epochs": epochs, "learning_rate": learning_rate, "l2": l2,
        "examples": [{"case_id": item.case_id, "entity_id": item.entity_id,
                      "observed_at": item.observed_at, "chain": item.chain,
                      "asset_id": item.asset_id, "label": item.label,
                      "reviewed": item.reviewed,
                      "features": item.features, "feature_as_of": item.feature_as_of,
                      "reviewed_at": item.reviewed_at,
                      "feature_snapshot_sha256": item.feature_snapshot_sha256,
                      "source_watermark": item.source_watermark}
                     for item in sorted(examples, key=lambda row: row.case_id)],
    }, sort_keys=True, separators=(",", ":"))
    model_manifest = hashlib.sha256(canonical.encode()).hexdigest()
    return {
        "status": "research_only_not_aml_validated",
        "chain": examples[0].chain, "asset_id": examples[0].asset_id,
        "feature_names": list(feature_names),
        "holdout": manifest,
        "source_lineage": lineage,
        "model_manifest_sha256": model_manifest,
        "metrics": metrics,
        "limitations": ["no_production_promotion", "requires_real_independent_labels",
                        "descriptive_calibration_is_not_probability_calibration", "requires_external_validation",
                        "declared_source_lineage_requires_independent_audit"],
    }
