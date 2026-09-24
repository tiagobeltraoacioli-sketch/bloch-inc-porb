"""Deterministic public graph features; no AML score or ownership inference."""
from __future__ import annotations

from collections import defaultdict, deque
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
import hashlib
import json
from math import sqrt
from pathlib import Path

from .normalization import Movement


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
    transaction_id: str | None = None
    event_index: int | None = None
    block_ref: str | None = None
    height_or_slot: int | None = None

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
        if self.chain in {"bitcoin", "bloch"} and self.sender_attribution != "unknown":
            raise ValueError("UTXO and eUTXO outputs do not identify a direct sender")
        timestamp(self.observed_at)


def events_from_movements(movements, *, block_times, max_events=50000):
    """Adapt normalized observations using explicit, source-provided block times.

    The caller must validate the block-time evidence and sample manifest. This
    adapter never substitutes ingestion time for an absent block timestamp.
    """
    if type(max_events) is not int or not 1 <= max_events <= 50000:
        raise ValueError("invalid event bound")
    if not isinstance(block_times, dict):
        raise ValueError("block timestamp mapping required")
    movements = tuple(movements)
    if len(movements) > max_events:
        raise ValueError("event bound exceeded")
    events = []
    for movement in movements:
        if not isinstance(movement, Movement):
            raise ValueError("normalized Movement required")
        if movement.finality not in {"confirmed", "finalized"}:
            raise ValueError("unconfirmed movement excluded")
        if movement.sender_attribution == "heuristic":
            raise ValueError("heuristic sender attribution excluded")
        key = (movement.chain, movement.network, movement.block_ref)
        block_time = block_times.get(key)
        if not isinstance(block_time, str):
            raise ValueError("source-provided block timestamp required for every movement")
        observed_at = timestamp(block_time).isoformat().replace("+00:00", "Z")
        events.append(TemporalEvent(
            movement.key, movement.chain, movement.network, movement.asset_id,
            movement.sender, movement.destination, movement.amount_base_units,
            observed_at, movement.source_id, movement.finality,
            movement.sender_attribution, movement.tx_id, movement.event_index,
            movement.block_ref, movement.height_or_slot,
        ))
    return tuple(events)


class GraphAnalytics:
    def __init__(self, events, max_events=50000):
        events = tuple(events)
        if len(events) > max_events:
            raise ValueError("event bound exceeded")
        keys = [(item.chain, item.network, item.asset_id, item.event_id) for item in events]
        if len(keys) != len(set(keys)):
            raise ValueError("duplicate chain event")
        self.events = events

    @classmethod
    def from_movements(cls, movements, *, block_times, max_events=50000):
        """Build a bounded private observation graph from normalized movements."""
        return cls(events_from_movements(movements, block_times=block_times,
                                         max_events=max_events), max_events=max_events)

    @classmethod
    def from_ethereum_pilot(cls, sample_dir):
        """Load one verified private pilot with a source-reported block time."""
        from .data_quality import inspect_ethereum_pilot

        sample_dir = Path(sample_dir)
        raw_path = sample_dir / "ethereum-pilot.jsonl"
        if raw_path.stat().st_size > 32_000_000:
            raise ValueError("Ethereum graph pilot exceeds byte bound")
        evidence = inspect_ethereum_pilot(sample_dir)
        block_time = evidence["source_reported_block_time"]
        if block_time is None:
            raise ValueError("source-reported block time required for temporal graph")
        raw = raw_path.read_bytes()
        if hashlib.sha256(raw).hexdigest() != evidence["sample_digest"]:
            raise ValueError("Ethereum graph pilot changed after validation")
        records = [json.loads(line) for line in raw.splitlines()]
        movements = [Movement(**{name: row[name] for name in Movement.__dataclass_fields__})
                     for row in records if row["record_type"] == "normalized_movement"]
        block_times = {("ethereum", "mainnet", evidence["source_reported_finalized_block_hash"]): block_time}
        return cls.from_movements(movements, block_times=block_times, max_events=5000)

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

    def wallet_constellation(self, *, chain, network, asset_id, wallet, start, end, max_events=200):
        """Build a bounded event-centered view without inventing UTXO senders.

        Each observation is an event node with its source and finality. A direct
        source link is present only for a directly observed account transfer.
        Neither the reference nodes nor temporal adjacency imply ownership.
        """
        if not isinstance(wallet, str) or not wallet:
            raise ValueError("wallet reference required")
        if not isinstance(max_events, int) or isinstance(max_events, bool) or not 1 <= max_events <= 500:
            raise ValueError("event bound exceeded")
        related = sorted(
            (item for item in self._window(chain, network, asset_id, start, end)
             if item.destination == wallet or item.sender == wallet),
            key=lambda item: (timestamp(item.observed_at), item.event_id),
        )
        if len(related) > max_events:
            raise ValueError("constellation exceeds event bound; narrow the window")
        references = {wallet}
        nodes = []
        links = []
        source_counts = defaultdict(int)
        finality_counts = defaultdict(int)
        for item in related:
            event_node = f"event:{item.event_id}"
            source_counts[item.source_id] += 1
            finality_counts[item.finality] += 1
            references.add(item.destination)
            nodes.append({
                "id": event_node, "kind": "observed_event", "event_id": item.event_id,
                "observed_at": item.observed_at, "source_id": item.source_id,
                "finality": item.finality, "amount_base_units": item.amount_base_units,
                "sender_attribution": item.sender_attribution,
                "transaction_id": item.transaction_id, "event_index": item.event_index,
                "block_ref": item.block_ref, "height_or_slot": item.height_or_slot,
            })
            links.append({
                "from": event_node, "to": f"reference:{item.destination}",
                "kind": "observed_destination", "event_id": item.event_id,
            })
            if item.sender_attribution == "direct":
                references.add(item.sender)
                links.append({
                    "from": f"reference:{item.sender}", "to": event_node,
                    "kind": "direct_observed_sender", "event_id": item.event_id,
                })
        reference_nodes = [
            {"id": f"reference:{reference}", "kind": "chain_reference",
             "reference": reference, "focus": reference == wallet}
            for reference in sorted(references)
        ]
        return {
            "classification": "event_centered_observation_graph",
            "chain": chain, "network": network, "asset_id": asset_id,
            "focus_reference": wallet,
            "window": {"start": start, "end_exclusive": end},
            "nodes": reference_nodes + nodes, "links": links,
            "summary": {
                "observed_events": len(related),
                "direct_sender_links": sum(item.sender_attribution == "direct" for item in related),
                "unknown_sender_events": sum(item.sender_attribution == "unknown" for item in related),
                "source_event_counts": [
                    {"source_id": source, "events": count}
                    for source, count in sorted(source_counts.items())
                ],
                "finality_event_counts": [
                    {"finality": finality, "events": count}
                    for finality, count in sorted(finality_counts.items())
                ],
            },
            "caveats": [
                "chain_references_are_not_people_or_ownership_claims",
                "UTXO_and_eUTXO_inputs_do_not_identify_a_sender",
                "event_adjacency_does_not_prove_value_continuity",
                "bounded_observations_do_not_establish_chain_coverage",
            ],
        }

    def wallet_temporal_motifs(self, *, chain, network, asset_id, wallet, start, end,
                               max_gap_hours=48, max_events=500, max_pairs=100):
        """Describe direct-peer diversity and ordered events without tracing value."""
        if not isinstance(wallet, str) or not wallet:
            raise ValueError("wallet reference required")
        if (type(max_gap_hours) is not int or not 1 <= max_gap_hours <= 168
                or type(max_events) is not int or not 1 <= max_events <= 500
                or type(max_pairs) is not int or not 1 <= max_pairs <= 100):
            raise ValueError("temporal motif bounds exceeded")
        related = sorted(
            (item for item in self._window(chain, network, asset_id, start, end)
             if item.destination == wallet or item.sender == wallet),
            key=lambda item: (timestamp(item.observed_at), item.event_id),
        )
        if len(related) > max_events:
            raise ValueError("temporal motif event bound exceeded; narrow the window")
        inbound = [item for item in related if item.destination == wallet
                   and item.sender_attribution == "direct" and item.sender != wallet]
        outbound = [item for item in related if item.sender == wallet
                    and item.sender_attribution == "direct" and item.destination != wallet]
        unknown = [item for item in related if item.destination == wallet
                   and item.sender_attribution == "unknown"]
        gap_bound = timedelta(hours=max_gap_hours)
        pairs = []
        for incoming in inbound:
            incoming_time = timestamp(incoming.observed_at)
            for outgoing in outbound:
                gap = timestamp(outgoing.observed_at) - incoming_time
                if not timedelta(0) < gap <= gap_bound:
                    continue
                pairs.append({
                    "inbound_event_id": incoming.event_id,
                    "outbound_event_id": outgoing.event_id,
                    "elapsed_seconds": int(gap.total_seconds()),
                    "source_ids": sorted({incoming.source_id, outgoing.source_id}),
                    "value_continuity_proven": False,
                })
                if len(pairs) > max_pairs:
                    raise ValueError("temporal motif pair bound exceeded; narrow the window")
        pairs.sort(key=lambda item: (item["elapsed_seconds"], item["inbound_event_id"],
                                     item["outbound_event_id"]))
        return {
            "classification": "descriptive_temporal_observations_not_score",
            "chain": chain, "network": network, "asset_id": asset_id,
            "wallet_reference": wallet,
            "window": {"start": start, "end_exclusive": end,
                       "max_gap_hours": max_gap_hours},
            "observed_events": len(related),
            "direct_inbound_events": len(inbound),
            "direct_outbound_events": len(outbound),
            "unknown_sender_events": len(unknown),
            "distinct_direct_inbound_peers": len({item.sender for item in inbound}),
            "distinct_direct_outbound_peers": len({item.destination for item in outbound}),
            "ordered_inbound_outbound_pairs": pairs,
            "source_ids": sorted({item.source_id for item in related}),
            "evidence_event_ids": [item.event_id for item in related],
            "caveats": [
                "temporal_proximity_does_not_prove_value_continuity_or_intent",
                "direct_protocol_references_do_not_identify_people_or_owners",
                "UTXO_and_eUTXO_inputs_do_not_identify_direct_senders",
                "bounded_observations_do_not_establish_chain_coverage",
            ],
        }

    def wallet_neighborhood(self, *, chain, network, asset_id, wallet, start, end,
                            max_hops=2, max_events=500, max_references=200):
        """Expand directly observed references through a bounded event graph."""
        if not isinstance(wallet, str) or not wallet:
            raise ValueError("wallet reference required")
        if (type(max_hops) is not int or max_hops not in (1, 2)
                or type(max_events) is not int or not 1 <= max_events <= 500
                or type(max_references) is not int or not 1 <= max_references <= 200):
            raise ValueError("neighborhood bounds exceeded")
        scoped = self._window(chain, network, asset_id, start, end)
        adjacency = defaultdict(list)
        for item in scoped:
            if item.sender_attribution == "direct":
                adjacency[item.sender].append((item.destination, item))
                adjacency[item.destination].append((item.sender, item))
        depths = {wallet: 0}
        frontier = [wallet]
        for depth in range(1, max_hops + 1):
            next_frontier = set()
            for reference in frontier:
                for neighbor, _ in adjacency[reference]:
                    if neighbor not in depths:
                        next_frontier.add(neighbor)
            if len(depths) + len(next_frontier) > max_references:
                raise ValueError("neighborhood reference bound exceeded; narrow the window")
            for reference in sorted(next_frontier):
                depths[reference] = depth
            frontier = sorted(next_frontier)
        selected = sorted(
            (item for item in scoped if
             (item.sender_attribution == "direct"
              and item.sender in depths and item.destination in depths
              and min(depths[item.sender], depths[item.destination]) < max_hops)
             or (item.sender_attribution == "unknown" and item.destination in depths)),
            key=lambda item: (timestamp(item.observed_at), item.event_id),
        )
        if len(selected) > max_events:
            raise ValueError("neighborhood event bound exceeded; narrow the window")
        nodes = [{"id": f"reference:{reference}", "kind": "chain_reference",
                  "reference": reference, "depth": depth, "focus": reference == wallet}
                 for reference, depth in sorted(depths.items(), key=lambda pair: (pair[1], pair[0]))]
        links = []
        direct_edges = []
        for item in selected:
            event_node = f"event:{item.event_id}"
            nodes.append({
                "id": event_node, "kind": "observed_event", "event_id": item.event_id,
                "observed_at": item.observed_at, "source_id": item.source_id,
                "finality": item.finality, "amount_base_units": item.amount_base_units,
                "sender_attribution": item.sender_attribution,
                "transaction_id": item.transaction_id, "event_index": item.event_index,
                "block_ref": item.block_ref, "height_or_slot": item.height_or_slot,
            })
            links.append({"from": event_node, "to": f"reference:{item.destination}",
                          "kind": "observed_destination", "event_id": item.event_id})
            if item.sender_attribution == "direct":
                links.append({"from": f"reference:{item.sender}", "to": event_node,
                              "kind": "direct_observed_sender", "event_id": item.event_id})
                direct_edges.append({
                    "event_id": item.event_id,
                    "step": min(depths[item.sender], depths[item.destination]) + 1,
                    "sender_reference": item.sender,
                    "destination_reference": item.destination,
                    "amount_base_units": item.amount_base_units,
                    "observed_at": item.observed_at,
                    "source_id": item.source_id,
                    "finality": item.finality,
                })
        return {
            "classification": "bounded_event_centered_neighborhood_not_ownership",
            "chain": chain, "network": network, "asset_id": asset_id,
            "focus_reference": wallet,
            "window": {"start": start, "end_exclusive": end, "max_hops": max_hops},
            "nodes": nodes, "links": links,
            "observed_direct_edges": direct_edges,
            "summary": {
                "references_by_depth": [
                    {"depth": depth, "count": sum(value == depth for value in depths.values())}
                    for depth in range(max_hops + 1)
                ],
                "observed_events": len(selected),
                "direct_sender_events": sum(item.sender_attribution == "direct" for item in selected),
                "unknown_sender_events": sum(item.sender_attribution == "unknown" for item in selected),
            },
            "evidence_event_ids": [item.event_id for item in selected],
            "source_ids": sorted({item.source_id for item in selected}),
            "caveats": [
                "references_are_not_people_or_owners",
                "graph_neighborhood_does_not_prove_value_continuity_or_intent",
                "UTXO_and_eUTXO_inputs_do_not_identify_direct_senders",
                "bounded_observations_do_not_establish_chain_coverage",
            ],
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
