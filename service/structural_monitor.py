"""Private aggregate quality and distribution comparison for structural histograms."""

import argparse
import json
import math
import os
import tempfile
from pathlib import Path

from service.aggregate_ml import FEATURES


MAX_INPUT_BYTES = 2_000_000
MAX_CELLS = 5000


def _positive_integer(value, name, *, minimum=0):
    if type(value) is not int or value < minimum:
        raise ValueError(f"invalid {name}")
    return value


def _validate(histogram):
    if not isinstance(histogram, dict) or histogram.get("status") != "privacy_reduced_structural_histogram":
        raise ValueError("only privacy-reduced structural histograms are accepted")
    expected = {"status", "source_sample_sha256", "source_complete", "sampled_transactions",
                "included_transactions", "suppressed_transactions", "unrepresented_transactions",
                "min_cell_count", "cells", "identifiers_included", "caveat"}
    if set(histogram) - expected or expected - {"caveat"} - set(histogram):
        raise ValueError("unexpected histogram fields")
    if histogram.get("identifiers_included") is not False:
        raise ValueError("identifiers are not allowed")
    digest = histogram.get("source_sample_sha256")
    if not isinstance(digest, str) or len(digest) != 64 or any(char not in "0123456789abcdef" for char in digest):
        raise ValueError("invalid source digest")
    if type(histogram.get("source_complete")) is not bool:
        raise ValueError("invalid source completeness")
    threshold = _positive_integer(histogram.get("min_cell_count"), "suppression threshold", minimum=5)
    counts = {name: _positive_integer(histogram.get(name), name) for name in
              ("sampled_transactions", "included_transactions", "suppressed_transactions", "unrepresented_transactions")}
    if sum(counts[name] for name in ("included_transactions", "suppressed_transactions", "unrepresented_transactions")) != counts["sampled_transactions"]:
        raise ValueError("inconsistent transaction accounting")
    cells = histogram.get("cells")
    if not isinstance(cells, list) or len(cells) > MAX_CELLS:
        raise ValueError("invalid cells")
    buckets = {}
    for cell in cells:
        if not isinstance(cell, dict) or set(cell) != set(FEATURES) | {"transaction_count"}:
            raise ValueError("invalid cell fields")
        shape = tuple(_positive_integer(cell.get(name), name) for name in FEATURES)
        count = _positive_integer(cell.get("transaction_count"), "cell count", minimum=threshold)
        if shape in buckets:
            raise ValueError("duplicate cell")
        buckets[shape] = count
    if sum(buckets.values()) != counts["included_transactions"]:
        raise ValueError("inconsistent released cells")
    if counts["sampled_transactions"] == 0:
        raise ValueError("empty sample")
    return buckets


def compare_histograms(reference, current):
    """Compare released structure and coverage without identifiers or cell-level output."""
    old = _validate(reference)
    new = _validate(current)
    if reference["min_cell_count"] != current["min_cell_count"]:
        raise ValueError("suppression thresholds differ")
    if reference["source_sample_sha256"] == current["source_sample_sha256"]:
        raise ValueError("comparison requires distinct source samples")

    # Suppressed shapes have unknown locations. Pool them rather than imputing bins.
    shapes = sorted(set(old) | set(new))
    def distribution(histogram, buckets):
        total = histogram["sampled_transactions"]
        return ([buckets.get(shape, 0) / total for shape in shapes]
                + [histogram["suppressed_transactions"] / total,
                   histogram["unrepresented_transactions"] / total])

    left, right = distribution(reference, old), distribution(current, new)
    midpoint = [(a + b) / 2 for a, b in zip(left, right)]
    def divergence(values):
        return sum(value * math.log2(value / middle) for value, middle in zip(values, midpoint) if value)

    js = (divergence(left) + divergence(right)) / 2
    tv = sum(abs(a - b) for a, b in zip(left, right)) / 2
    def quality(histogram):
        total = histogram["sampled_transactions"]
        return {
            "sampled_transactions": total,
            "released_fraction": round(histogram["included_transactions"] / total, 6),
            "suppressed_fraction": round(histogram["suppressed_transactions"] / total, 6),
            "unrepresented_fraction": round(histogram["unrepresented_transactions"] / total, 6),
            "source_complete": histogram["source_complete"],
        }

    return {
        "status": "private_aggregate_research_monitor_only",
        "reference": quality(reference),
        "current": quality(current),
        "released_shape_count_reference": len(old),
        "released_shape_count_current": len(new),
        "suppression_threshold": reference["min_cell_count"],
        "distribution_comparison": {
            "jensen_shannon_divergence_bits": round(js, 6),
            "total_variation_distance": round(tv, 6),
            "suppressed_and_unrepresented_kept_as_separate_opaque_buckets": True,
        },
        "aml_labels_used": False,
        "wallet_scores_computed": 0,
        "production_ready": False,
        "caveat": "Descriptive sample difference only. Samples may overlap, suppressed shapes are pooled, coverage may differ, and no temporal trend, AML accuracy, alert threshold, or wallet conclusion follows.",
    }


def read_private_histogram(path):
    with Path(path).open("rb") as handle:
        raw = handle.read(MAX_INPUT_BYTES + 1)
    if len(raw) > MAX_INPUT_BYTES:
        raise ValueError("histogram exceeds input byte bound")
    return json.loads(raw)


def write_private_report(report, output):
    output = Path(output)
    output.parent.mkdir(mode=0o700, parents=True, exist_ok=True)
    os.chmod(output.parent, 0o700)
    descriptor, temporary_name = tempfile.mkstemp(prefix=".structural-monitor-", suffix=".tmp", dir=output.parent)
    temporary = Path(temporary_name)
    try:
        os.chmod(temporary, 0o600)
        with os.fdopen(descriptor, "w") as handle:
            json.dump(report, handle, indent=2, sort_keys=True)
            handle.write("\n")
            handle.flush()
            os.fsync(handle.fileno())
        os.replace(temporary, output)
    finally:
        if temporary.exists():
            temporary.unlink()


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--reference", type=Path, required=True)
    parser.add_argument("--current", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    report = compare_histograms(read_private_histogram(args.reference), read_private_histogram(args.current))
    write_private_report(report, args.output)
    print(json.dumps({"status": report["status"], "distribution_comparison": report["distribution_comparison"],
                      "production_ready": False}))


if __name__ == "__main__":
    main()
