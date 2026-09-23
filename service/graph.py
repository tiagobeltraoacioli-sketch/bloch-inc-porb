"""Bounded, provenance-aware graph paths for research review support."""

import math
from collections import defaultdict, deque
from dataclasses import dataclass
from datetime import datetime, timezone

FLOW_KINDS = {"value_flow", "verified_bridge_flow"}


@dataclass(frozen=True)
class EvidenceEdge:
    edge_id: str
    source_node: str
    target_node: str
    kind: str
    source_id: str
    observed_at: str
    expires_at: str
    confidence: float
    finalized: bool
    bridge_proof_id: str = ""


class EvidenceGraph:
    def __init__(self):
        self.outgoing = defaultdict(list)
        self.edge_ids = set()

    def add(self, edge):
        if edge.edge_id in self.edge_ids:
            raise ValueError("duplicate edge ID")
        if edge.kind not in FLOW_KINDS or not edge.source_node or not edge.target_node or not edge.source_id:
            raise ValueError("unsupported or incomplete edge")
        if edge.kind == "verified_bridge_flow" and not edge.bridge_proof_id:
            raise ValueError("cross-chain flow needs bridge proof")
        if not edge.finalized or not (0 < edge.confidence <= 1):
            raise ValueError("only finalized, confidence-scored edges are accepted")
        seen = datetime.fromisoformat(edge.observed_at.replace("Z", "+00:00"))
        expiry = datetime.fromisoformat(edge.expires_at.replace("Z", "+00:00"))
        if seen.tzinfo is None or expiry.tzinfo is None or expiry <= seen:
            raise ValueError("invalid edge timestamps")
        self.edge_ids.add(edge.edge_id)
        self.outgoing[edge.source_node].append(edge)

    def trace_to_anchors(self, start, anchor_ids, *, max_hops=3, max_paths=20, as_of=None):
        """Return explainable exposure paths, never a crime or sanctions verdict."""
        if not (1 <= max_hops <= 4 and 1 <= max_paths <= 100):
            raise ValueError("path bounds exceeded")
        now = as_of or datetime.now(timezone.utc)
        found = []
        queue = deque([(start, (), frozenset({start}), 1.0, None)])
        while queue and len(found) < max_paths:
            node, path, visited, weight, last_observed = queue.popleft()
            if len(path) >= max_hops:
                continue
            eligible = []
            for edge in self.outgoing[node]:
                observed = datetime.fromisoformat(edge.observed_at.replace("Z", "+00:00"))
                expires = datetime.fromisoformat(edge.expires_at.replace("Z", "+00:00"))
                if observed <= now < expires and (last_observed is None or observed >= last_observed):
                    eligible.append(edge)
            hub_factor = 1 / math.sqrt(max(1, len(eligible)))
            for edge in eligible:
                if edge.target_node in visited:
                    continue
                next_path = path + (edge,)
                next_weight = weight * edge.confidence * hub_factor * 0.5
                if edge.target_node in anchor_ids:
                    found.append({
                        "classification": "association_only",
                        "edge_ids": [item.edge_id for item in next_path],
                        "source_ids": sorted({item.source_id for item in next_path}),
                        "hops": len(next_path),
                        "ranking_weight_not_probability": round(next_weight, 6),
                        "review_required": True,
                    })
                    if len(found) >= max_paths:
                        break
                else:
                    queue.append((edge.target_node, next_path, visited | {edge.target_node}, next_weight, datetime.fromisoformat(edge.observed_at.replace("Z", "+00:00"))))
        return sorted(found, key=lambda item: (-item["ranking_weight_not_probability"], item["hops"]))
