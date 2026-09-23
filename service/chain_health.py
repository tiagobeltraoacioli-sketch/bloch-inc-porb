"""Bounded initial-scope Ethereum and Bitcoin source checks, not ingestion."""

import json
import os
import re
from datetime import datetime, timezone
from pathlib import Path
from urllib.request import Request, urlopen

ROOT = Path(__file__).resolve().parents[1]
STATUS = Path(os.environ.get("PORB_STATUS_DIR", str(ROOT / "site" / "assets"))) / "chain-health-status.json"
ETH_RPC = os.environ.get("PORB_ETH_RPC", "https://ethereum-rpc.publicnode.com")
SOL_RPC = os.environ.get("PORB_SOL_RPC", "https://api.mainnet.solana.com")
BTC_API = os.environ.get("PORB_BTC_API", "https://blockstream.info/api")
MAX_BYTES = 500_000


def fetch_json_rpc(url, method, params):
    payload = json.dumps({"jsonrpc": "2.0", "method": method, "params": params, "id": 1}).encode()
    request = Request(url, data=payload, headers={"Content-Type": "application/json", "User-Agent": "BlochInc-PoRB/0.1 chain-health"})
    with urlopen(request, timeout=15) as response:
        raw = response.read(MAX_BYTES + 1)
    if len(raw) > MAX_BYTES:
        raise ValueError("RPC response exceeds bound")
    body = json.loads(raw)
    if not isinstance(body, dict) or body.get("id") != 1 or body.get("error") or "result" not in body:
        raise ValueError("invalid RPC response")
    return body["result"]


def ethereum():
    block = fetch_json_rpc(ETH_RPC, "eth_getBlockByNumber", ["finalized", False])
    if not isinstance(block, dict) or not re.fullmatch(r"0x[0-9a-fA-F]+", block.get("number", "")) or not re.fullmatch(r"0x[0-9a-fA-F]{64}", block.get("hash", "")):
        raise ValueError("invalid finalized Ethereum block")
    return {"chain": "ethereum", "network": "mainnet", "source_url": ETH_RPC, "reported_finalized_height": int(block["number"], 16), "reported_finalized_hash": block["hash"], "sample_only": True}


def solana():
    slot = fetch_json_rpc(SOL_RPC, "getSlot", [{"commitment": "finalized"}])
    if type(slot) is not int or slot < 1:
        raise ValueError("invalid finalized Solana slot")
    return {"chain": "solana", "network": "mainnet", "source_url": SOL_RPC, "reported_finalized_slot": slot, "sample_only": True}


def bitcoin():
    request = Request(BTC_API + "/blocks/tip/height", headers={"User-Agent": "BlochInc-PoRB/0.1 chain-health"})
    with urlopen(request, timeout=15) as response:
        raw = response.read(32)
    if not re.fullmatch(rb"[0-9]{1,10}\s*", raw):
        raise ValueError("invalid Bitcoin tip height")
    return {"chain": "bitcoin", "network": "mainnet", "source_url": BTC_API, "reported_tip_height": int(raw), "finality": "probabilistic_not_asserted", "sample_only": True}


def publish_health():
    results = {}
    for name, check in (("ethereum", ethereum), ("bitcoin", bitcoin)):
        try:
            results[name] = {"status": "reachable", **check()}
        except (OSError, ValueError, TypeError, KeyError, json.JSONDecodeError):
            results[name] = {"status": "unavailable", "chain": name}
    status = {
        "retrieved_at": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
        "kind": "public_source_health_only",
        "sources": results,
        "transactions_ingested": 0,
        "risk_scores_computed": 0,
        "coverage_note": "Third-party/public Ethereum and Bitcoin endpoints report heights only. Bloch is probed separately. No independent finality verification, full history, or AML data coverage.",
    }
    STATUS.parent.mkdir(parents=True, exist_ok=True)
    temporary = STATUS.with_suffix(".json.tmp")
    temporary.write_text(json.dumps(status, indent=2) + "\n")
    temporary.replace(STATUS)
    return status


if __name__ == "__main__":
    current = publish_health()
    print("Chain source health:", {name: value["status"] for name, value in current["sources"].items()})
    if any(value["status"] != "reachable" for value in current["sources"].values()):
        raise SystemExit(1)
