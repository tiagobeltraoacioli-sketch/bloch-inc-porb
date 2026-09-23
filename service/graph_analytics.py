"""Deterministic public graph features; no AML score or ownership inference."""
from __future__ import annotations

from collections import defaultdict, deque
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from math import sqrt


def timestamp(value):
    parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    if parsed.tzinfo is None:
        raise ValueError("timestamps require a timezone")
    return parsed.astimezone(timezone.utc)


@dataclass(frozen=True)
class TemporalEvent:
    event_id: str
    chain: str
    network: str
    asset_id: str
    sender: str | None
    destination: str
    amount_base_units: int
    observed_at: str
    source_id: str
    finality: str
    sender_attribution: str

    def __post_init__(self):
        if not all(isinstance(value, str) and value for value in (self.event_id, self.chain, self.network, self.asset_id, self.destination, self.source_id)):
            raise ValueError("event identity and source are required")
        if not isinstance(self.amount_base_units, int) or not (0 < self.amount_base_units < 2**128):
            raise ValueError("invalid amount")
        if self.finality not in {"confirmed", "finalized"}:
            raise ValueError("unconfirmed events are excluded")
        if self.sender_attribution not in {"direct", "unknown"}:
            raise ValueError("heuristic sender attribution is excluded")
        if self.sender_attribution == "direct" and not self.sender:
            raise ValueError("direct sender must be present")
        if self.sender_attribution == "unknown" and self.sender is not None:
            raise ValueError("unknown sender cannot be asserted")
        timestamp(self.observed_at)


class GraphAnalytics:
    def __init__(self, events, max_events=50000):
        events = tuple(events)
        if len(events) > max_events:
            raise ValueError("event bound exceeded")
        keys = [(item.chain, item.network, item.asset_id, item.event_id) for item in events]
        if len(keys) != len(set(keys)):
            raise ValueError("duplicate chain event")
        self.events = events

    def _window(self, chain, network, asset_id, start, end):
        lower, upper = timestamp(start), timestamp(end)
        if lower >= upper or upper - lower > timedelta(days=366):
            raise ValueError("invalid or excessive analysis window")
        return [item for item in self.events if item.chain == chain and item.network == network and item.asset_id == asset_id and lower <= timestamp(item.observed_at) < upper]

    def wallet_features(self, *, chain, network, asset_id, wallet, start, end):
        """Return auditable descriptive features, not a risk classification."""
        if not wallet:
            raise ValueError("wallet reference required")
        scoped = self._window(chain, network, asset_id, start, end)
        related = [item for item in scoped if item.destination == wallet or item.sender == wallet]
        inbound = [item for item in related if item.destination == wallet]
        outbound = [item for item in related if item.sender == wallet and item.sender_attribution == "direct"]
        inbound_amount = sum(item.amount_base_units for item in inbound)
        outbound_amount = sum(item.amount_base_units for item in outbound)
        peers = {item.sender for item in inbound if item.sender_attribution == "direct" and item.sender != wallet}
        peers.update(item.destination for item in outbound if item.destination != wallet)
        counterparty_amount = defaultdict(int)
        for item in inbound:
            if item.sender_attribution == "direct" and item.sender != wallet:
                counterparty_amount[item.sender] += item.amount_base_units
        for item in outbound:
            if item.destination != wallet:
                counterparty_amount[item.destination] += item.amount_base_units
        attributed_total = sum(counterparty_amount.values())
        concentration = round(max(counterparty_amount.values()) / attributed_total, 6) if attributed_total else None
        daily = defaultdict(int)
        for item in related:
            daily[timestamp(item.observed_at).date().isoformat()] += item.amount_base_units
        start_date = timestamp(start).date()
        end_date = (timestamp(end) - timedelta(microseconds=1)).date()
        day_count = (end_date - start_date).days + 1
        values = [daily.get((start_date + timedelta(days=index)).isoformat(), 0) for index in range(day_count)]
        regression = linear_trend(values)
        event_times = sorted(timestamp(item.observed_at) for item in related)
        gaps = [(event_times[index] - event_times[index - 1]).total_seconds() for index in range(1, len(event_times))]
        mean_gap = sum(gaps) / len(gaps) if gaps else None
        gap_cv = round(sqrt(sum((value - mean_gap) ** 2 for value in gaps) / len(gaps)) / mean_gap, 6) if gaps and mean_gap else None
        return {
            "classification": "descriptive_non_score_features",
            "chain": chain, "network": network, "asset_id": asset_id, "wallet_reference": wallet,
            "window": {"start": start, "end_exclusive": end, "days": day_count},
            "features": {
                "event_count": len(related), "inbound_count": len(inbound), "outbound_count": len(outbound),
                "inbound_base_units": inbound_amount, "outbound_base_units": outbound_amount,
                "distinct_direct_counterparties": len(peers),
                "largest_direct_counterparty_share": concentration,
                "inter_event_gap_cv": gap_cv,
                "daily_volume_regression_slope_base_units": regression["slope"],
                "daily_volume_regression_r2": regression["r2"],
            },
            "daily_volume_base_units": [{"date": (start_date + timedelta(days=index)).isoformat(), "value": value} for index, value in enumerate(values)],
            "evidence_event_ids": sorted(item.event_id for item in related),
            "source_ids": sorted({item.source_id for item in related}),
            "caveats": ["no_ownership_or_illicitness_inference", "unknown_sender_excluded_from_counterparty_graph", "regression_is_descriptive_not_causal"],
        }

    def temporal_paths(self, *, chain, network, asset_id, source_wallet, target_wallet, start, end, max_hops=3, max_paths=20):
        """Trace time-ordered direct observations; paths are associations only."""
        if not (1 <= max_hops <= 4 and 1 <= max_paths <= 100):
            raise ValueError("path bounds exceeded")
        if not source_wallet or not target_wallet or source_wallet == target_wallet:
            raise ValueError("distinct source and target are required")
        adjacency = defaultdict(list)
        for item in self._window(chain, network, asset_id, start, end):
            if item.sender_attribution == "direct" and item.sender != item.destination:
                adjacency[item.sender].append(item)
        for edges in adjacency.values():
            edges.sort(key=lambda item: (item.observed_at, item.event_id))
        found = []
        queue = deque([(source_wallet, (), frozenset({source_wallet}), None)])
        while queue and len(found) < max_paths:
            node, path, seen, last_time = queue.popleft()
            if len(path) >= max_hops:
                continue
            for edge in adjacency[node]:
                when = timestamp(edge.observed_at)
                if edge.destination in seen or (last_time is not None and when < last_time):
                    continue
                next_path = path + (edge,)
                if edge.destination == target_wallet:
                    found.append({
                        "classification": "temporal_association_only",
                        "event_ids": [item.event_id for item in next_path],
                        "source_ids": sorted({item.source_id for item in next_path}),
                        "hops": len(next_path),
                        "first_observed_at": next_path[0].observed_at,
                        "last_observed_at": next_path[-1].observed_at,
                        "value_continuity_proven": False,
                    })
                    if len(found) >= max_paths:
                        break
                else:
                    queue.append((edge.destination, next_path, seen | {edge.destination}, when))
        return found


def linear_trend(values):
    """Ordinary least squares against day index; no inferential claim."""
    n = len(values)
    if n < 3:
        return {"slope": None, "r2": None, "sample_days": n}
    mean_x = (n - 1) / 2
    mean_y = sum(values) / n
    denominator = sum((index - mean_x) ** 2 for index in range(n))
    slope = sum((index - mean_x) * (value - mean_y) for index, value in enumerate(values)) / denominator
    variation = sum((value - mean_y) ** 2 for value in values)
    error = sum((value - (mean_y + slope * (index - mean_x))) ** 2 for index, value in enumerate(values))
    return {"slope": round(slope, 6), "r2": round(max(0, 1 - error / variation), 6) if variation else None, "sample_days": n}
