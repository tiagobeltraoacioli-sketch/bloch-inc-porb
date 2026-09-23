"""Fail-closed score authorization contract for a future private service.

This module checks authorization metadata only. It does not compute or serve scores.
"""
from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timezone


@dataclass(frozen=True)
class ScoreGrant:
    grant_id: str
    issuer: str
    grantee: str
    tenant_id: str
    purpose: str
    wallet_scope: frozenset[str]
    expires_at: datetime
    approved: bool


@dataclass(frozen=True)
class ScoreRequest:
    actor: str
    tenant_id: str
    purpose: str
    wallet_id: str
    verified_person: bool
    authenticated: bool
    audit_ready: bool
    lawful_basis_recorded: bool


def score_access(request: ScoreRequest, grant: ScoreGrant, now: datetime | None = None) -> bool:
    """Require an explicit, current, scoped delegation and operational safeguards."""
    now = now or datetime.now(timezone.utc)
    if now.tzinfo is None or grant.expires_at.tzinfo is None:
        raise ValueError("timestamps must be timezone aware")
    return all((
        request.authenticated,
        request.verified_person,
        request.audit_ready,
        request.lawful_basis_recorded,
        grant.approved,
        bool(grant.grant_id and grant.issuer and grant.grantee),
        request.actor == grant.grantee,
        request.tenant_id == grant.tenant_id,
        request.purpose == grant.purpose,
        request.wallet_id in grant.wallet_scope,
        now < grant.expires_at,
    ))
