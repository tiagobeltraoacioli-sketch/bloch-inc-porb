# Delivery roadmap

| Gate | Deliverable | Exit evidence |
| --- | --- | --- |
| 0 — Product preview | Public synthetic dashboard, external architecture, example API contract | Synthetic labeling visible on every view; no real data |
| 1 — Data governance | Controller/processor map, legal basis, vendor licenses, retention schedule, DPIA/RIPD decision, transfer assessment | Signed reviews and field-level data inventory |
| 2 — Bloch adapter | Finalized RPC/indexer ingestion, idempotency, reorg rollback, chain/asset isolation, observability | Replay tests and reconciliation against reference blocks |
| 3 — External signals | Licensed API connectors, provenance, stale/expiry gates, exact-match verification | Source-specific quality and contract tests |
| 4 — Private service | Tenant auth, role access, encryption, audit logs, reviewer queue, disputes, deletion workflows | Security review, access and lifecycle tests |
| 5 — Model validation | Shadow scoring, labeled evaluation, bias/false-positive review, drift monitoring | Real-world validation report with uncertainty and limitations |
| 6 — Limited launch | Private tenant dashboard, support and incident playbooks, service-level monitoring | Approved operations and legal sign-off |

No live screening, regulatory compliance claim, or automated customer denial is in the current release.
