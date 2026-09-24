# Bloch Inc — Proof of Red and Blue Score (BI-PoRB)

BI-PoRB is a proposed **external, optional** Bloch Inc transaction monitoring and wallet reputation service. It consumes permitted chain and third-party API data, attaches source and freshness metadata to each signal, and returns advisory evidence to authenticated customers. It is **not a consensus module**. No AML score, wallet label, personal data, or provider finding is committed to Bloch blocks.

**Graphus of Bloch Inc — A Matter of Data 2.0** is the proposed data and graph platform behind BI-PoRB. See the [Graphus product boundary](docs/graphus-product.md).

The private [Ethereum pilot](docs/ethereum-private-pilot.md) preserves source-reported block time and can materialize a bounded, digest-checked event graph. Its aggregate summary and source comparison remain on the restricted data host. The public constellation defaults to synthetic examples; separate bounded public-chain lookups show source-reported balances and events.

The [Graphus preview](https://bloch-graphus.xyz/) presents the initial [three-network, five-asset scope](docs/initial-assets.md), a [research app](https://bloch-graphus.xyz/app.html) connecting Constellation and Oculum with asset-aware search and browser-local saved views, a synthetic [wallet constellation with two-step expansion and an event inspector](https://bloch-graphus.xyz/constellation.html) plus separate real lookups, [Oculum's queried-sample holder map](https://bloch-graphus.xyz/oculum), a temporal path explorer and observed-shapes panel, an [84-field data atlas](https://bloch-graphus.xyz/catalog.html), and a [DaaS proposal](https://bloch-graphus.xyz/daas.html). The [deep architecture](docs/graphus-2-architecture.md) specifies the proposed event model, temporal graph, ML evaluation, ZK research, and release gates.

## Current status

This repository contains an English-language product site and **synthetic risk demonstration**, a local authenticated preview API, official OFAC source synchronization, bounded private Bitcoin, Ethereum, and Bloch transaction pilots, a private Bloch query index, deterministic graph features, offline ML research tools, a privacy-first data contract, architecture, and an implementation roadmap. It does not ingest full chain histories, make legal AML determinations, or operate a production screening service. The supplied `bloch-pobrs.zip` is a separate research prototype; its synthetic metrics are not production performance claims and its consensus design is not adopted here.

Private research now includes [second-operator Bitcoin sample reconciliation](docs/bitcoin-second-source-reconciliation.md), bounded [Bitcoin](docs/bitcoin-private-query-index.md) and [Ethereum](docs/ethereum-private-query-index.md) query indexes, a [Bloch outpoint evidence view](docs/bloch-private-query-index.md) and [checkpointed sample continuation](docs/bloch-checkpoint-backfill.md), a bounded [Ethereum second-source comparison](docs/ethereum-second-source-reconciliation.md), an event-centered normalized [graph adapter](docs/graph-intelligence.md), and [aggregate structural monitoring](docs/ml-validation.md). None is connected to the public synthetic dashboard or a production decision service.

## Run locally

```sh
cd site && python3 -m http.server 8080
```

Open `http://127.0.0.1:8080`. All dashboard data are fixed synthetic examples. To run the optional local example API:

```sh
PORB_DEMO_TOKEN='replace-with-local-test-token' python3 -m service.app
curl -H 'Authorization: Bearer replace-with-local-test-token' http://127.0.0.1:8765/api/v1/overview
```

The API binds to localhost and requires a token. To add the first official source, run `python3 -m service.ofac_sync`; this downloads OFAC SDN and supplementary comments into the ignored `.data/` directory, then publishes **aggregate source metadata only** to the site. The authenticated local `POST /api/v1/sanctions:screen` supports exact identifier comparison. Do not expose this preview API to the Internet or put customer data into it.

Run `python3 -m service.bloch_probe` for a bounded, read-only health and five-transaction sample from the public Bloch historical indexer. It publishes aggregate source status only. It does not perform full ingestion or compute real AML scores.

Run `python3 -m service.chain_health` for bounded Ethereum and Bitcoin public-source height checks. Bloch is probed separately. These checks ingest **zero transactions**; public endpoints are replaceable and cannot support a production coverage claim.

## Product boundaries

- The protocol adapter reads finalized public-chain data and reports finality/reorg status. It never changes validation, block headers, transaction acceptance, or balances.
- Vendor connectors require a recorded contractual right to use each field, regional processing policy, retention window, and source freshness. A potential match is evidence for human review, never an accusation.
- The current public site uses synthetic wallets and transactions. Future lawful chain facts, graphs, regressions, and reviewed non-score ML detail may be public after source-rights and privacy review. Only a future score requires explicit delegation to a named, identity-verified person. Private identity, IP context, and customer cases remain restricted.
- Transaction signals (Red) and wallet context (Blue) are separate outputs. Blue is a contextual reputation estimate, not proof of identity or innocence.
- Customer policy decisions remain outside this service; a score does not automatically block a transaction.

See [architecture](docs/architecture.md), [initial asset registry](docs/initial-assets.md), [adapter design](docs/chain-adapters.md), [temporal graph design](docs/graph-intelligence.md), [API contract](docs/api-v1.md), [privacy design](docs/privacy.md), [delegated score access](docs/access-policy.md), [DaaS contract](docs/graphus-daas.md), [AML/FT reference standard](docs/aml-reference-standard.md), [public/open source catalog](docs/source-catalog.md), [learning and validation design](docs/ml-validation.md), and [roadmap](docs/roadmap.md).

The [infrastructure allocation](docs/infrastructure.md) reserves the L2 server and assigns the unused DEX and Bridge servers to private data and ML/ZK research roles. The [deployment verification](docs/deployment-status.md) records the first operational jobs and tested worker. The [proof contract](docs/zk-proof-contract.md) defines the first research target. The initial server deployment runs only outbound source refresh and bounded health jobs; it does not expose a customer API, train a live model, or produce a ZK proof.
