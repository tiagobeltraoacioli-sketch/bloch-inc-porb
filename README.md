# Bloch Inc — Proof of Red and Blue Score (BI-PoRB)

BI-PoRB is a proposed **external, optional** Bloch Inc transaction monitoring and wallet reputation service. It consumes permitted chain and third-party API data, attaches source and freshness metadata to each signal, and returns advisory evidence to authenticated customers. It is **not a consensus module**. No AML score, wallet label, personal data, or provider finding is committed to Bloch blocks.

**Graphus of Bloch Inc — A Matter of Data 2.0** is the proposed data and graph platform behind BI-PoRB. See the [Graphus product boundary](docs/graphus-product.md).

The private [Ethereum pilot](docs/ethereum-private-pilot.md) preserves source-reported block time and can materialize a bounded, digest-checked event graph. Its aggregate summary and source comparison remain on the restricted data host. The public constellation defaults to real source-reported network samples, with earlier-page collection and separate identifier lookups. Synthetic examples require explicit selection.

The [Graphus preview](https://bloch-graphus.xyz/) presents the initial [three-network, five-asset scope](docs/initial-assets.md), a [research app](https://bloch-graphus.xyz/app.html) connecting Constellation and Oculum with asset-aware search and browser-local saved views, a real [wallet constellation with paginated collection, directed paths and transaction inspection](https://bloch-graphus.xyz/constellation.html), [Oculum's real address discovery, observed-balance map and exact comparison](https://bloch-graphus.xyz/oculum), a temporal path explorer and observed-shapes panel, an [84-field data atlas](https://bloch-graphus.xyz/catalog.html), and a [DaaS proposal](https://bloch-graphus.xyz/daas.html). The [deep architecture](docs/graphus-2-architecture.md) specifies the proposed event model, temporal graph, ML evaluation, ZK research, and release gates.

## Current status

The [Data Atlas implementation](docs/graphus-data-atlas.md) replaces the static 84-field design table with source-bound calculations, reference/time filters, temporal patterns, exact concentrations, regression diagnostics, holdout evaluation and reproducible exports. It adds private notes, processing and source-rights records, retention/correction workflows, UN/UK/EU reference lookups, and reviewed grants scoped to one saved reference. Saved samples can be compared with verified digests and exact event deltas. Public captures and private saved analyses also support bounded temporal paths with ordered event inspection, source coverage, search-limit disclosure and reproducible JSON reports. Validated AML scores, unsupported bridge evidence and customer jurisdiction context retain explicit release gates. Both sites are published and migration `0004_atlas.sql` is applied; the guide records production verification and the remaining authenticated-check limitation.

The [evidence enrichment and research API](docs/aml-data-enrichment.md) adds private OFAC exact-identifier reports, a separate nearest-neighbor ML baseline, collection of up to eight source pages, shared evidence profiles across System Map/Constellation/Oculum, and scoped batch/profile/model APIs. The portal's key-generation form includes permission presets; the partner contract documents 38 operations. Official-source evidence stays separate from descriptive Red/Blue scores.

The [System Map](https://bloch-graphus.xyz/map) connects 44 modules, including ten AML workspace components, with implementation/access status, input/output contracts, clickable dependencies and product links. Its evidence workbench collects up to eight real source pages, retains provenance, filters exact values and compares a pinned baseline with the current sample. Full collections and filtered subsets include dataset digests and open directly in Analytics or Constellation. The [saved evidence graph](docs/graphus-evidence-graph.md) retains the captured sample, checks local JSON imports and shows exact per-reference connections and amounts. See the [module and evidence workbench guide](docs/graphus-system-map.md).

The [private BI-PoRB portal](https://rednblue.space/portal/) unifies real Graphus and Bloch Space observations for Bitcoin, Ethereum and Bloch. It includes invitation-only email/password access, organization roles, scoped API keys, saved datasets, Isolation Forest Red scores, observed-record completeness Blue scores, clustering and historical time-series evaluation. Its interactive graphs support reference and transaction search, clickable connections and exact record inspection. See the [portal methods, API and deployment guide](docs/porb-private-portal.md). These are descriptive observation scores without judgments or identity labels.

The [Analytics Lab](https://bloch-graphus.xyz/analytics.html) loads **real public-chain records by default**, with BTC, ETH, USDT, USDC and BLCH recent-network samples and direct address queries. Six graph charts, directed paths, PageRank, filters and CSV/JSON exports preserve exact values and source anchors. Two additional charts analyze indexed BLCH balance concentration. Demonstrations are explicit opt-in; source failures never become synthetic data. See [methods, scope and verification](docs/graphus-analytics-lab.md) and the [real network collection and balance feed](docs/graphus-real-network-feed.md).

This repository contains an English-language product site and **synthetic risk demonstration**, a local authenticated preview API, official OFAC source synchronization, bounded private Bitcoin, Ethereum, and Bloch transaction pilots, a private Bloch query index, deterministic graph features, offline ML research tools, a privacy-first data contract, architecture, and an implementation roadmap. It does not ingest full chain histories, make legal AML determinations, or operate a production screening service. The supplied `bloch-pobrs.zip` is a separate research prototype; its synthetic metrics are not production performance claims and its consensus design is not adopted here.

Private research now includes [second-operator Bitcoin sample reconciliation](docs/bitcoin-second-source-reconciliation.md), bounded [Bitcoin](docs/bitcoin-private-query-index.md) and [Ethereum](docs/ethereum-private-query-index.md) query indexes, a [Bloch outpoint evidence view](docs/bloch-private-query-index.md) and [checkpointed sample continuation](docs/bloch-checkpoint-backfill.md), a bounded [Ethereum second-source comparison](docs/ethereum-second-source-reconciliation.md), an event-centered normalized [graph adapter](docs/graph-intelligence.md), and [aggregate structural monitoring](docs/ml-validation.md). None is connected to the public synthetic dashboard or a production decision service.

## Run locally

```sh
cd site && python3 -m http.server 8080
```

Open `http://127.0.0.1:8080` for the legacy synthetic preview. The private portal requires Pages Functions and its isolated D1 binding; see the deployment guide above. To run the optional local example API:

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
- The private observation portal reports Red structural deviation and Blue record completeness separately. Its model contract supersedes the legacy preview's reputation terminology for this descriptive product.
- Customer policy decisions remain outside this service; a score does not automatically block a transaction.

See [architecture](docs/architecture.md), [initial asset registry](docs/initial-assets.md), [adapter design](docs/chain-adapters.md), [temporal graph design](docs/graph-intelligence.md), [API contract](docs/api-v1.md), [privacy design](docs/privacy.md), [delegated score access](docs/access-policy.md), [DaaS contract](docs/graphus-daas.md), [AML/FT reference standard](docs/aml-reference-standard.md), [public/open source catalog](docs/source-catalog.md), [learning and validation design](docs/ml-validation.md), and [roadmap](docs/roadmap.md).

The [infrastructure allocation](docs/infrastructure.md) reserves the L2 server and assigns the unused DEX and Bridge servers to private data and ML/ZK research roles. The [deployment verification](docs/deployment-status.md) records the first operational jobs and tested worker. The [proof contract](docs/zk-proof-contract.md) defines the first research target. The initial server deployment runs only outbound source refresh and bounded health jobs; it does not expose a customer API, train a live model, or produce a ZK proof.
