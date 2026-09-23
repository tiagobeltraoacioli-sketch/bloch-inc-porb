"""Offline, maturity-aware walk-forward evaluation for reviewed research cases."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime

from service.ml_research import ResearchExample, train_reviewed_baseline


@dataclass(frozen=True)
class WalkForwardWindow:
    start: str
    end: str
    review_capacity: int


def _instant(value: str, field: str) -> datetime:
    if not isinstance(value, str):
        raise ValueError(f"{field} must be a timezone-aware ISO timestamp")
    try:
        parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError as error:
        raise ValueError(f"{field} must be a timezone-aware ISO timestamp") from error
    if parsed.tzinfo is None:
        raise ValueError(f"{field} must be timezone-aware")
    return parsed


def evaluate_walk_forward(
    examples: list[ResearchExample],
    *,
    windows: list[WalkForwardWindow],
    evaluation_at: str,
    feature_names: list[str] | tuple[str, ...],
) -> dict:
    """Train only on outcomes available before each window; test later cases.

    The caller must supply historical features as they were known at observation
    time. Timestamps enforce this declared boundary, but cannot prove provenance.
    """
    examples = tuple(examples)
    windows = tuple(windows)
    if not examples or not windows:
        raise ValueError("examples and windows required")
    assessed_at = _instant(evaluation_at, "evaluation_at")
    if len({item.case_id for item in examples}) != len(examples):
        raise ValueError("duplicate case ID")
    if len({(item.chain, item.asset_id) for item in examples}) != 1:
        raise ValueError("one chain and asset required")
    dated = []
    for item in examples:
        observed = _instant(item.observed_at, "observed_at")
        available = _instant(item.feature_as_of, "feature_as_of")
        reviewed = _instant(item.reviewed_at, "reviewed_at")
        if available > observed or reviewed < observed:
            raise ValueError("features must be available by observation; labels reviewed afterward")
        dated.append((item, observed, reviewed))
    reports = []
    previous_end = None
    for window in windows:
        start = _instant(window.start, "window.start")
        end = _instant(window.end, "window.end")
        if start >= end or end > assessed_at or (previous_end is not None and start < previous_end):
            raise ValueError("windows must be ordered, nonoverlapping, and mature by evaluation_at")
        previous_end = end
        training = [item for item, observed, reviewed in dated if observed < start and reviewed < start]
        immature_training = sum(observed < start and reviewed >= start for _, observed, reviewed in dated)
        testing = [(item, reviewed) for item, observed, reviewed in dated if start <= observed < end]
        if any(reviewed > assessed_at for _, reviewed in testing):
            raise ValueError("window contains outcomes not reviewed by evaluation_at")
        result = train_reviewed_baseline(
            training + [item for item, _ in testing], cutoff=window.start,
            feature_names=feature_names, review_capacity=window.review_capacity,
        )
        reports.append({
            "window_start": window.start,
            "window_end": window.end,
            "outcomes_excluded_from_training_as_immature": immature_training,
            "result": result,
        })
    return {
        "status": "walk_forward_research_only_not_aml_validated",
        "chain": examples[0].chain,
        "asset_id": examples[0].asset_id,
        "evaluation_at": evaluation_at,
        "windows": reports,
        "limitations": [
            "timestamps_are_declared_and_source_provenance_requires_independent_audit",
            "reviewed_cases_may_not_represent_all_activity",
            "no_production_promotion_or_wallet_score",
        ],
    }
