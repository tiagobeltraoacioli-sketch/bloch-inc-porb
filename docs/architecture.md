# External service architecture

```mermaid
flowchart LR
  A[Bloch finalized chain / indexer API] --> B[Network adapter]
  V[Licensed provider APIs] --> C[Provider connectors]
  B --> D[Normalize + deduplicate + finality]
  C --> E[Purpose + license + freshness gate]
  D --> F[Minimal feature store]
  E --> F
  F --> G[Red transaction signals]
  F --> H[Blue wallet context]
  G --> I[Evidence + confidence + expiry]
  H --> I
  I --> J[Human review + dispute]
  I --> K[Authenticated tenant API]
  J --> K
  K --> L[Customer workflow / optional Bloch app adapter]
  K --> M[Private analytics dashboard]
```

The adapter is read-only. It must wait for the configured chain finality threshold, tolerate reorganizations, key records by `(chain_id, network, asset_id, tx_id)`, and retain source timestamps. Vendor evidence is stored separately from public chain observations. Identity mapping, if legally justified, belongs in a more restricted encrypted store and is never required for a chain address score.

No validator, mempool, block header, state root, protocol governance, or on-chain sanction list depends on BI-PoRB. If the service is unavailable, Bloch continues to operate.

## Source material assessment

The user-supplied `DESIGN.md`, `architecture.svg`, and `bloch-pobrs.zip` describe an oracle-free scoring engine inside consensus. That direction is superseded for this product. The Rust prototype passed 25 tests in an isolated review, but it lacks persistence, reorg handling, asset isolation, external source provenance, and production validation. It also has no supplied license; this repository does not redistribute its source. Reuse requires a separate code review and licensing decision. Its simulated learning curve is displayed only as research data.
