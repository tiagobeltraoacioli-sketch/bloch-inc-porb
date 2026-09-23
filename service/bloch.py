"""Bounded read-only adapter for the public Bloch historical indexer."""

import json
import os
import re
from datetime import datetime, timezone
from pathlib import Path
from urllib.request import Request, urlopen

from .normalization import Movement

BASE = "https://blochl1.com/indexer"
PUBLIC_STATUS = Path(os.environ.get("PORB_STATUS_DIR", str(Path(__file__).resolve().parents[1] / "site" / "assets"))) / "bloch-status.json"
MAX_RESPONSE = 2_000_000


def get_json(path):
    request = Request(BASE + path, headers={"Accept": "application/json", "User-Agent": "BlochInc-PoRB/0.1 source-probe"})
    with urlopen(request, timeout=15) as response:
        if "application/json" not in response.headers.get("Content-Type", ""):
            raise ValueError("unexpected indexer content type")
        raw = response.read(MAX_RESPONSE + 1)
    if len(raw) > MAX_RESPONSE:
        raise ValueError("indexer response exceeds bound")
    return json.loads(raw)


def normalized_outputs(tx, finalized_height):
    if not isinstance(tx.get("height"), int) or not isinstance(tx.get("slot"), int):
        raise ValueError("missing height or slot")
    if tx["height"] > finalized_height:
        return []
    txid = tx.get("txid", "")
    block_id = tx.get("block_id", "")
    if not re.fullmatch(r"[a-fA-F0-9]{64}", txid) or not re.fullmatch(r"[a-fA-F0-9]{64}", block_id):
        raise ValueError("invalid chain identifier")
    movements = []
    for index, output in enumerate(tx.get("outputs", [])):
        amount = output.get("value_sat")
        destination = output.get("script_hash")
        if not isinstance(amount, str) or not re.fullmatch(r"[0-9]{1,39}", amount):
            raise ValueError("invalid output amount")
        if not re.fullmatch(r"[a-fA-F0-9]{64}", destination or ""):
            raise ValueError("invalid output script hash")
        if int(amount) == 0:
            continue
        movements.append(Movement(
            "bloch", "genesis4-mainnet", "blch", txid.lower(), index,
            block_id.lower(), tx["slot"], "finalized", int(amount), destination.lower(),
            None, "unknown", "bloch-historical-indexer",
        ))
    return movements


def probe(limit=5):
    if not (1 <= limit <= 10):
        raise ValueError("probe limit must be 1–10")
    health = get_json("/health")
    if health.get("ok") is not True or not isinstance(health.get("finalized_height"), int):
        raise ValueError("indexer has no valid finalized height")
    page = get_json(f"/transactions?limit={limit}")
    if not isinstance(page.get("as_of_slot"), int) or not isinstance(page.get("transactions"), list):
        raise ValueError("invalid indexer page")
    movements = []
    for tx in page["transactions"]:
        movements.extend(normalized_outputs(tx, health["finalized_height"]))
    return {
        "source_id": "bloch-historical-indexer",
        "kind": "public_chain_observation",
        "retrieved_at": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
        "source_url": BASE,
        "indexer_source": health.get("source"),
        "indexed_to_slot": health.get("indexed_to_slot"),
        "indexed_to_height": health.get("indexed_to_height"),
        "reported_finalized_height": health["finalized_height"],
        "as_of_slot": page["as_of_slot"],
        "sampled_transactions": len(page["transactions"]),
        "sampled_finalized_outputs": len(movements),
        "sample_only": True,
        "risk_scores_computed": 0,
        "coverage_note": "Bounded public indexer probe only; no wallet labels, full-history ingestion, or AML score. Node finality is reported, not an independent settlement guarantee.",
    }


def publish_probe():
    status = probe()
    PUBLIC_STATUS.write_text(json.dumps(status, indent=2) + "\n")
    return status
