"""Official OFAC SDN address identifiers for local, exact-match review support."""

import csv
import hashlib
import io
import json
import os
import re
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path
from urllib.request import Request, urlopen

ROOT = Path(__file__).resolve().parents[1]
PRIVATE_DIR = Path(os.environ.get("PORB_PRIVATE_DIR", str(ROOT / ".data"))) / "ofac"
PUBLIC_STATUS = Path(os.environ.get("PORB_STATUS_DIR", str(ROOT / "site" / "assets"))) / "ofac-status.json"
SOURCE_URLS = {
    "sdn.csv": "https://www.treasury.gov/ofac/downloads/sdn.csv",
    "sdn_comments.csv": "https://www.treasury.gov/ofac/downloads/sdn_comments.csv",
}
ADDRESS_RE = re.compile(r"Digital Currency Address\s*-\s*([A-Za-z0-9]+)\s+([A-Za-z0-9]{12,256})", re.I)
MAX_BYTES = 25_000_000
MAX_AGE_HOURS = 48


class SourceUnavailable(ValueError):
    """The official snapshot is absent, stale, or failed integrity checks."""


def now_utc():
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


def parse_identifiers(raw_files):
    """Keep only address identifiers and OFAC entry IDs; no names or other PII."""
    records = set()
    counts = Counter()
    for filename, data in raw_files.items():
        rows = csv.reader(io.StringIO(data.decode("utf-8-sig", errors="replace")))
        for row in rows:
            if not row or not row[0].strip().isdigit():
                continue
            entry_id = row[0].strip()
            counts[filename] += 1
            for cell in row[1:]:
                for match in ADDRESS_RE.finditer(cell):
                    symbol, address = match.groups()
                    records.add((entry_id, symbol.upper(), address))
    return records, counts


def public_status(manifest, records, row_counts):
    by_symbol = Counter(symbol for _, symbol, _ in records)
    return {
        "source_id": "ofac-sdn-official",
        "kind": "official_public_sanctions_list",
        "purpose": "exact identifier screening for human review",
        "retrieved_at": manifest["retrieved_at"],
        "source_urls": list(SOURCE_URLS.values()),
        "sha256": manifest["combined_sha256"],
        "sdn_rows": row_counts["sdn.csv"],
        "supplement_rows": row_counts["sdn_comments.csv"],
        "address_identifiers": len(records),
        "by_symbol": dict(sorted(by_symbol.items())),
        "bloch_blch_identifiers": by_symbol.get("BLCH", 0),
        "coverage_note": "Only explicitly listed identifiers in this OFAC snapshot. No match does not mean low risk; OFAC says listed digital currency addresses are not exhaustive.",
        "match_policy": "Exact asset symbol and address; network/ownership verification and human review required.",
        "wallets_or_people_screened": 0,
    }


def _write_private(path, data):
    fd = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
    with os.fdopen(fd, "wb") as output:
        output.write(data)


def sync():
    PRIVATE_DIR.mkdir(parents=True, exist_ok=True, mode=0o700)
    os.chmod(PRIVATE_DIR, 0o700)
    raw_files = {}
    hashes = {}
    for name, url in SOURCE_URLS.items():
        request = Request(url, headers={"User-Agent": "BlochInc-PoRB/0.1 source-sync"})
        with urlopen(request, timeout=45) as response:
            data = response.read(MAX_BYTES + 1)
        if len(data) > MAX_BYTES:
            raise ValueError(f"{name} exceeds size limit")
        raw_files[name] = data
        hashes[name] = hashlib.sha256(data).hexdigest()
    records, counts = parse_identifiers(raw_files)
    if counts["sdn.csv"] < 1000 or len(records) < 100:
        raise ValueError("OFAC snapshot failed sanity checks")
    manifest = {
        "retrieved_at": now_utc(),
        "files": {name: {"url": SOURCE_URLS[name], "sha256": hashes[name], "bytes": len(raw_files[name])} for name in SOURCE_URLS},
        "combined_sha256": hashlib.sha256(raw_files["sdn.csv"] + raw_files["sdn_comments.csv"]).hexdigest(),
    }
    for name, data in raw_files.items():
        _write_private(PRIVATE_DIR / name, data)
    _write_private(PRIVATE_DIR / "manifest.json", (json.dumps(manifest, indent=2) + "\n").encode())
    status = public_status(manifest, records, counts)
    PUBLIC_STATUS.write_text(json.dumps(status, indent=2) + "\n")
    return status


def load():
    manifest = json.loads((PRIVATE_DIR / "manifest.json").read_text())
    retrieved = datetime.fromisoformat(manifest["retrieved_at"].replace("Z", "+00:00"))
    age_hours = (datetime.now(timezone.utc) - retrieved).total_seconds() / 3600
    if age_hours < 0 or age_hours > MAX_AGE_HOURS:
        raise SourceUnavailable("OFAC snapshot is stale")
    raw_files = {}
    for name in SOURCE_URLS:
        data = (PRIVATE_DIR / name).read_bytes()
        if hashlib.sha256(data).hexdigest() != manifest["files"][name]["sha256"]:
            raise SourceUnavailable("OFAC snapshot checksum mismatch")
        raw_files[name] = data
    records, _ = parse_identifiers(raw_files)
    return manifest, records


def screen_identifier(asset_symbol, address):
    if not re.fullmatch(r"[A-Za-z0-9]{2,12}", asset_symbol) or not re.fullmatch(r"[A-Za-z0-9]{12,256}", address):
        raise ValueError("invalid asset symbol or address format")
    manifest, records = load()
    symbol = asset_symbol.upper()
    # Hex EVM identifiers are case insensitive. Other identifiers remain exact.
    matched = sorted(entry for entry, sym, listed in records if sym == symbol and (listed.lower() == address.lower() if symbol in {"ETH", "USDT", "USDC"} and listed.startswith("0x") else listed == address))
    return {
        "source_id": "ofac-sdn-official",
        "source_sha256": manifest["combined_sha256"],
        "retrieved_at": manifest["retrieved_at"],
        "asset_symbol": symbol,
        "result": "potential_exact_identifier_match" if matched else "no_exact_identifier_match_in_snapshot",
        "source_entry_ids": matched,
        "attribution_level": "listed_address_identifier",
        "review_required": bool(matched),
        "limitations": "A listed identifier requires network, ownership, listing status, and legal review. Absence is not clearance.",
    }
