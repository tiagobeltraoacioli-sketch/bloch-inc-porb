# Bloch Inc — Proof of Red and Blue Score (BI-PoRB)

BI-PoRB is a proposed **external, optional** Bloch Inc transaction monitoring and wallet reputation service. It consumes permitted chain and third-party API data, attaches source and freshness metadata to each signal, and returns advisory evidence to authenticated customers. It is **not a consensus module**. No AML score, wallet label, personal data, or provider finding is committed to Bloch blocks.

## Current status

This repository contains an English-language product site and **synthetic risk demonstration**, a local authenticated preview API, official OFAC source synchronization, a bounded Bloch indexer probe, a privacy-first data contract, architecture, and an implementation roadmap. It does not ingest full chain histories, make legal AML determinations, or operate a production screening service. The supplied `bloch-pobrs.zip` is a separate research prototype; its synthetic metrics are not production performance claims and its consensus design is not adopted here.

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

## Product boundaries

- The protocol adapter reads finalized public-chain data and reports finality/reorg status. It never changes validation, block headers, transaction acceptance, or balances.
- Vendor connectors require a recorded contractual right to use each field, regional processing policy, retention window, and source freshness. A potential match is evidence for human review, never an accusation.
- Wallet-level results are tenant-scoped and authenticated. The public site only shows synthetic aggregates.
- Transaction signals (Red) and wallet context (Blue) are separate outputs. Blue is a contextual reputation estimate, not proof of identity or innocence.
- Customer policy decisions remain outside this service; a score does not automatically block a transaction.

See [architecture](docs/architecture.md), [four-chain adapter design](docs/chain-adapters.md), [temporal graph design](docs/graph-intelligence.md), [API contract](docs/api-v1.md), [privacy design](docs/privacy.md), [public/open source catalog](docs/source-catalog.md), [learning and validation design](docs/ml-validation.md), and [roadmap](docs/roadmap.md).

The [infrastructure allocation](docs/infrastructure.md) reserves the L2 server and assigns the unused DEX and Bridge servers to private data and ML/ZK research roles. The [deployment verification](docs/deployment-status.md) records the first operational jobs and tested worker. The [proof contract](docs/zk-proof-contract.md) defines the first research target. The initial server deployment runs only outbound source refresh jobs; it does not expose a customer API, train a live model, or produce a ZK proof.
