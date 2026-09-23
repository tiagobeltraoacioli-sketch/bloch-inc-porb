"""Weighted k-means research on privacy-reduced transaction-shape histograms."""

import argparse
import hashlib
import json
import math
import os
import random
from pathlib import Path


FEATURES = ("input_log2_bin", "output_log2_bin", "created_value_log10_bin")


def fit_histogram(histogram, clusters=3, seed=42, iterations=100):
    if histogram.get("status") != "privacy_reduced_structural_histogram" or histogram.get("identifiers_included") is not False:
        raise ValueError("only privacy-reduced histogram input is accepted")
    cells = histogram.get("cells", [])
    if len(cells) < 2 or not 2 <= clusters <= len(cells) or not 1 <= iterations <= 1000:
        raise ValueError("insufficient diversity or invalid training bounds")
    if any(item.get("transaction_count", 0) < histogram.get("min_cell_count", 5) for item in cells):
        raise ValueError("unsuppressed small cell")
    points = [tuple(float(item[name]) for name in FEATURES) for item in cells]
    counts = [item["transaction_count"] for item in cells]
    total = sum(counts)
    means = [sum(point[index] * count for point, count in zip(points, counts)) / total for index in range(3)]
    scales = []
    for index in range(3):
        variance = sum(count * (point[index] - means[index]) ** 2 for point, count in zip(points, counts)) / total
        scales.append(math.sqrt(variance) if variance else 1.0)
    normalized = [tuple((point[index] - means[index]) / scales[index] for index in range(3)) for point in points]
    rng = random.Random(seed)
    centroids = [normalized[rng.randrange(len(normalized))]]
    while len(centroids) < clusters:
        weights = [count * min(sum((value - center[index]) ** 2 for index, value in enumerate(point)) for center in centroids)
                   for point, count in zip(normalized, counts)]
        if sum(weights) == 0:
            choice = next(point for point in normalized if point not in centroids)
        else:
            threshold = rng.random() * sum(weights)
            choice = normalized[-1]
            for point, weight in zip(normalized, weights):
                threshold -= weight
                if threshold <= 0:
                    choice = point
                    break
        centroids.append(choice)
    assignment = None
    for _ in range(iterations):
        assigned = [min(range(clusters), key=lambda cluster: sum((value - centroids[cluster][index]) ** 2 for index, value in enumerate(point))) for point in normalized]
        if assigned == assignment:
            break
        assignment = assigned
        updated = []
        for cluster in range(clusters):
            members = [(point, count) for point, count, label in zip(normalized, counts, assignment) if label == cluster]
            if not members:
                updated.append(centroids[cluster])
            else:
                mass = sum(count for _, count in members)
                updated.append(tuple(sum(point[index] * count for point, count in members) / mass for index in range(3)))
        centroids = updated
    populations = [sum(count for count, label in zip(counts, assignment) if label == cluster) for cluster in range(clusters)]
    inertia = sum(count * sum((value - centroids[label][index]) ** 2 for index, value in enumerate(point))
                  for point, count, label in zip(normalized, counts, assignment))
    digest = hashlib.sha256(json.dumps(histogram, sort_keys=True, separators=(",", ":")).encode()).hexdigest()
    return {
        "status": "unsupervised_structural_research_only",
        "source_histogram_sha256": digest,
        "sampled_transactions": histogram["sampled_transactions"],
        "included_transactions": histogram["included_transactions"],
        "suppressed_transactions": histogram["suppressed_transactions"],
        "unrepresented_transactions": histogram.get("unrepresented_transactions", 0),
        "features": list(FEATURES),
        "clusters": [{"cluster_id": index, "transactions": populations[index],
                      "center_log_bins": {name: round(centroids[index][feature] * scales[feature] + means[feature], 3) for feature, name in enumerate(FEATURES)}}
                     for index in range(clusters)],
        "weighted_inertia": round(inertia, 6),
        "aml_labels_used": False,
        "wallet_scores_computed": 0,
        "caveat": "Descriptive transaction shapes only; no wallet identity, illicitness, causal conclusion, or AML precision claim.",
    }


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--histogram", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    histogram = json.loads(args.histogram.read_text())
    clusters = min(3, len(histogram.get("cells", [])))
    report = fit_histogram(histogram, clusters=clusters)
    args.output.parent.mkdir(mode=0o700, parents=True, exist_ok=True)
    descriptor = os.open(args.output, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
    with os.fdopen(descriptor, "w") as handle:
        json.dump(report, handle, indent=2, sort_keys=True)
        handle.write("\n")
    print(json.dumps({"status": report["status"], "clusters": len(report["clusters"]),
                      "included_transactions": report["included_transactions"],
                      "suppressed_transactions": report["suppressed_transactions"],
                      "wallet_scores_computed": 0}))


if __name__ == "__main__":
    main()
