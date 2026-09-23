# BI-PoRB API v1 preview contract

Base URL for the **local synthetic preview**: `http://127.0.0.1:8765`. This is not a production API endpoint. Only `GET /health` and authenticated `GET /api/v1/overview` are implemented. The token is supplied in `Authorization: Bearer <PORB_DEMO_TOKEN>` and is never placed in the public site. Responses use `Cache-Control: no-store`. All other operations are unavailable.

The overview payload contains `mode: synthetic_demo`, `as_of`, `method`, `sample_size`, aggregate metrics, Red/Blue trends, typology counts, review-state samples, and a source registry. Every view is explicitly labeled as synthetic.

## Proposed private API (not implemented)

`POST /v1/transactions:assess` will accept a chain/network/asset/transaction reference and return advisory risk evidence **after** finalized-chain reconciliation. `GET /v1/wallets/{address}/context` will return tenant-scoped, expiring contextual signals. `GET /v1/signals/{id}` will include factual basis, source, observed/ingested timestamps, confidence, attribution level, expiry, model version, and review/dispute status. `POST /v1/cases/{id}/reviews` will record authorized human outcomes.

These endpoints require per-tenant authentication, purpose-scoped permissions, rate limits, audit logs, deletion/rectification workflows, source license enforcement, and jurisdiction-specific safeguards before implementation. No public wallet lookup is planned.
