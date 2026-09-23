# Temporal evidence graph

BI-PoRB's graph is a **heterogeneous, temporal evidence graph** designed initially for Bloch, Ethereum native/USDT/USDC ERC-20, and Bitcoin. Solana is a later extension. The evidence graph is off-chain; public factual views and ML detail are separated from tenant-scoped cases and delegated scores. Its purpose is to show why a case deserves review, not to classify people as criminals by graph proximity.

## Typed nodes and edges

Nodes: chain transaction, UTXO/outpoint, account or script, EVM contract, Solana token account/program, asset, verified bridge message, source record, and review case. Identity records and IP observations stay in separate restricted stores and are linked only with an approved purpose and role.

Edges: spent output, created output, instruction effect, token transfer, source attribution, confirmed bridge receipt, and reviewer-confirmed association. Each edge carries chain/network, asset, direction, amount, observed/finality time, source ID, evidence reference, confidence, expiry, and reviewer/dispute state. Only a verified bridge receipt creates a cross-chain value-flow edge. A shared timestamp, exchange deposit address, or graph neighborhood does not prove common ownership.

## Advanced graph analytics roadmap

- Temporal motifs: rapid pass-through, fan-in/fan-out, peel chains, cyclic flows, layering, and repeated small probes.
- Bounded exposure paths: at most four hops, expiration, degree-aware downweighting, direction, and explicit source references. Path ranking weight is **not** a risk probability.
- Entity hypotheses: reversible, versioned, confidence-scored clusters; no irreversible merge from a heuristic. Shared-service hubs and exchange hot wallets are treated as high-degree confounders.
- Multi-chain flows: bridge proof, source and destination transaction lineage, asset mapping, and timing windows with missingness. Unproven bridge correlations remain hypotheses.
- Graph learning research: temporal graph embeddings or neural models may be evaluated offline against rule baselines, with leakage controls, reviewer labels, calibration, and adversarial tests. They cannot go live based on synthetic data.
- Explanation: every proposed relationship can be expanded to its typed path, source, time, and alternative interpretation. Corrections and disputes remove or downgrade the affected edge and trigger dependent score recomputation.

The `service/graph.py` module implements a small bounded path prototype with source IDs, expiry, event-time ordering, finality, bridge-proof gates, and hub downweighting. It is not a production graph database or a trained AML model.
