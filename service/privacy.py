"""Minimal privacy primitives for future tenant-scoped AML features."""

import hashlib
import hmac
import ipaddress
import re
from datetime import datetime, timedelta, timezone


def tenant_pseudonym(tenant_key, purpose, value):
    """Create a scoped pseudonym; output remains personal data if relinkable."""
    if not isinstance(tenant_key, bytes) or len(tenant_key) < 32:
        raise ValueError("tenant key must be at least 32 bytes")
    if purpose not in {"wallet", "network_event"} or not isinstance(value, str) or not value:
        raise ValueError("invalid purpose or value")
    message = f"bi-porb:v1:{purpose}:{value}".encode("utf-8")
    return hmac.new(tenant_key, message, hashlib.sha256).hexdigest()


def reduce_ip_observation(raw_ip, inferred_country, source_id, observed_at):
    """Return only a short-lived country context; never return or log the IP."""
    ip = ipaddress.ip_address(raw_ip)
    if not ip.is_global:
        raise ValueError("network context requires a public IP")
    if not re.fullmatch(r"[A-Z]{2}", inferred_country):
        raise ValueError("invalid country code")
    if not re.fullmatch(r"[A-Za-z0-9._-]{3,80}", source_id):
        raise ValueError("invalid source ID")
    seen = datetime.fromisoformat(observed_at.replace("Z", "+00:00"))
    if seen.tzinfo is None:
        raise ValueError("observed_at must include timezone")
    seen = seen.astimezone(timezone.utc)
    if seen > datetime.now(timezone.utc) + timedelta(minutes=5):
        raise ValueError("observed_at cannot be in the future")
    return {
        "signal_type": "ip_country_context",
        "country_code": inferred_country,
        "source_id": source_id,
        "observed_at": seen.isoformat().replace("+00:00", "Z"),
        "expires_at": (seen + timedelta(hours=24)).isoformat().replace("+00:00", "Z"),
        "attribution_level": "network_observation_only",
        "location_verified": False,
        "decision_allowed": False,
    }
