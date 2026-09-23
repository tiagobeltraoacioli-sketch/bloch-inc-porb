"""Shared contract for four chain adapters; no live RPC calls in this preview."""

import hashlib
import re
from dataclasses import dataclass
from typing import Optional

CHAINS = {"bloch", "ethereum", "solana", "bitcoin"}
FINALITY = {"observed", "confirmed", "finalized"}
ATTRIBUTION = {"direct", "heuristic", "unknown"}


@dataclass(frozen=True)
class Movement:
    chain: str
    network: str
    asset_id: str
    tx_id: str
    event_index: int
    block_ref: str
    height_or_slot: int
    finality: str
    amount_base_units: int
    destination: str
    sender: Optional[str]
    sender_attribution: str
    source_id: str

    def __post_init__(self):
        if self.chain not in CHAINS or self.finality not in FINALITY or self.sender_attribution not in ATTRIBUTION:
            raise ValueError("unsupported chain, finality, or attribution")
        for field in (self.network, self.asset_id, self.tx_id, self.block_ref, self.destination, self.source_id):
            if not isinstance(field, str) or not re.fullmatch(r"[A-Za-z0-9:._-]{1,256}", field):
                raise ValueError("invalid movement identifier")
        if self.sender is not None and (not isinstance(self.sender, str) or not re.fullmatch(r"[A-Za-z0-9:._-]{1,256}", self.sender)):
            raise ValueError("invalid sender")
        if self.sender_attribution == "direct" and self.sender is None:
            raise ValueError("direct attribution requires sender")
        if self.sender_attribution == "unknown" and self.sender is not None:
            raise ValueError("unknown attribution cannot assert sender")
        if self.event_index < 0 or self.height_or_slot < 0 or not (0 < self.amount_base_units < 2**128):
            raise ValueError("invalid event index, height, or amount")

    @property
    def key(self):
        fields = (self.chain, self.network, self.asset_id, self.tx_id, str(self.event_index))
        return hashlib.sha256("\x1f".join(fields).encode()).hexdigest()

    @property
    def score_eligible(self):
        return self.finality == "finalized" and self.sender_attribution != "heuristic"


def bitcoin_output(*, network, tx_id, vout, block_hash, height, value_sats, destination, source_id):
    """A Bitcoin output has no defensible person-level sender attribution."""
    return Movement("bitcoin", network, "btc", tx_id, vout, block_hash, height, "confirmed", value_sats, destination, None, "unknown", source_id)
