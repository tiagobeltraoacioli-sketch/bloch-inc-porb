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

## Event-centered constellation prototype

`service/graph_analytics.py` exposes `wallet_constellation` for a single chain, network, asset, reference, and time window. It returns source- and finality-tagged **event nodes** plus typed links to chain references. A Bitcoin or Bloch output has an `observed_destination` link only; its input references do not identify a sender. A directly observed Ethereum native or ERC-20 transfer can additionally have a `direct_observed_sender` link. The module rejects direct sender attribution for Bitcoin UTXO and Bloch eUTXO events. A chain reference can be an address or script reference; it is not a person or ownership claim.

The response reports event counts by source and finality, plus the number of direct and unknown sender observations. It is deterministic across event input order. It refuses more than 500 events, with a caller-selected lower limit, instead of silently truncating a constellation. It does not link assets or chains, infer value continuity through intermediary events, score wallets, or establish historical coverage. The current public Graphus view still uses synthetic fixtures; the private bounded pilots are not exposed through this graph method on the public site.

### Public synthetic path explorer

The Graphus constellation preview now lets a visitor choose two synthetic ETH, USDT, or USDC points and inspect up to five directed routes of one to three steps. It searches only the fixture's chosen asset and orders steps by **different calendar days**; the fixture lacks intraday timestamps, so same-day events cannot establish a sequence. A selected route highlights its points and arrows on the constellation, while each card lists its synthetic event IDs, dates, and amounts. BTC and BLCH are excluded from account-style routes because an input outpoint does not identify a direct sender. This is a browser-only demonstration, not a live chain path search, proof of value continuity, or AML inference. The Python `temporal_paths` method is a separate bounded observation prototype and is not exposed by the public site.

### Observed temporal shapes

The public synthetic constellation also counts direct inbound and outbound peers for account-style ETH, USDT, and USDC fixture events. A one-to-three-day selector lists inbound/outbound event pairs in different-day order, with both event IDs and amounts available for inspection. These are possible event sequences, **not** traced funds, ownership links, or AML findings. Bitcoin and Bloch display an unknown peer boundary because their input references alone do not identify direct senders; no account-style pairs are computed for them.

The separate private `wallet_temporal_motifs` method uses source-provided observation timestamps, returns evidence and source IDs, and checks a caller-selected gap up to 168 hours. It fails rather than truncate when more than 500 relevant events or 100 ordered pairs are found. It reports unknown-sender events separately and explicitly marks value continuity as unproven. These bounded observations do not establish full chain coverage, and the method is not exposed through the public site.

### Bounded neighborhood expansion

The public synthetic map can expand a searched ETH, USDT, or USDC point from one to two graph steps. The center, immediate peers, and second-step peers occupy separate visual rings. Gray links show illustrative adjacency; transaction arrows and the existing event panels remain tied to the selected wallet. The selector stays at one step for BTC and BLCH because an input outpoint is not a directly observed sender. The preview uses only generated wallet examples and does not query a chain.

An event inspector below the map lists every generated direct-transfer event in the selected one- or two-step neighborhood. It can filter step 1 or step 2, shows event ID, direction, date, exact fixture amount, and source label, and highlights the selected directed link. Sender and recipient buttons change the focus point. No edge between two outer-ring points is drawn as part of the two-step neighborhood, since both endpoints are already at its boundary. The list is scrollable and exposes all matching fixture events, without silent truncation.

The separate private `wallet_neighborhood` method expands only directly observed account-transfer references within one chain, network, asset, and explicit time window. Its output keeps event nodes, directed sender/destination links, source IDs, finality, depth, and evidence event IDs. Unknown-sender UTXO/eUTXO outputs can attach to an already reached reference but cannot expand the graph. Requests fail if they exceed two steps, 200 references, or 500 included events; callers may set lower bounds. References and proximity are neither ownership nor value-continuity claims. The private method is not exposed through the public site.

The private response now also includes an `observed_direct_edges` list. Each row preserves the event ID, graph step, sender and destination references, base-unit amount, observation time, source ID, and finality. It is a view over the same selected event nodes, not an inferred entity or flow-through edge. Unknown-sender events remain event nodes without a direct edge row.

### Normalized observation adapter

`GraphAnalytics.from_movements(movements, block_times=...)` converts a bounded sequence of canonical `Movement` records to the same event-centered graph. The timestamp map is keyed by `(chain, network, block_ref)` and must contain a timezone-aware **source-provided block time** for every movement. The caller must validate those timestamps and the private sample manifest against its source; the adapter does not fetch or verify either. It refuses an absent block time, an observed but unconfirmed movement, heuristic sender attribution, duplicate event keys, and direct Bitcoin/Bloch sender attribution. It never uses collection time as event time.

`GraphAnalytics.from_ethereum_pilot(sample_dir)` adds a private, digest-checked bridge from a bounded Ethereum pilot artifact to this event graph. The collector now records the source-reported block timestamp in new manifests; older pilots without it are rejected by the temporal graph bridge while remaining usable for quality inspection and the bounded query index. Graph queries over one pilot remain observations from the selected transactions of one block, not chain history coverage.

Each event node retains its canonical event key, transaction ID, output/log index, block reference, height or slot, source ID, finality, amount, and attribution. Query with the same explicit chain, network, asset, reference, and bounded time window as `wallet_constellation`. An Ethereum USDC log cannot enter an ETH view, even if it shares the transaction and destination. A Bitcoin or Bloch output only creates an event-to-destination link, never an input-to-sender or wallet-to-wallet link. These are **private bounded observations**, not historical chain coverage or independently verified finality; the public site continues to use synthetic fixtures.
