# Bloch Inc — Proof of Red and Blue Score (BI-PoRB)

BI-PoRB is a proposed **external, optional** Bloch Inc transaction monitoring and wallet reputation service. It consumes permitted chain and third-party API data, attaches source and freshness metadata to each signal, and returns advisory evidence to authenticated customers. It is **not a consensus module**. No AML score, wallet label, personal data, or provider finding is committed to Bloch blocks.

## Current status

This repository contains an English-language product site and **synthetic demonstration**, a local authenticated read-only example API, a privacy-first data contract, architecture, and an implementation roadmap. It does not ingest live chain or vendor data, make legal AML determinations, or operate a production screening service. The supplied `bloch-pobrs.zip` is a separate research prototype; its synthetic metrics are not production performance claims and its consensus design is not adopted here.

## Run locally

```sh
cd site && python3 -m http.server 8080
```

Open `http://127.0.0.1:8080`. All dashboard data are fixed synthetic examples. To run the optional local example API:

```sh
PORB_DEMO_TOKEN='replace-with-local-test-token' python3 -m service.app
curl -H 'Authorization: Bearer replace-with-local-test-token' http://127.0.0.1:8765/api/v1/overview
```

The API binds to localhost and requires a token. Do not put real data into this prototype.

## Product boundaries

- The protocol adapter reads finalized public-chain data and reports finality/reorg status. It never changes validation, block headers, transaction acceptance, or balances.
- Vendor connectors require a recorded contractual right to use each field, regional processing policy, retention window, and source freshness. A potential match is evidence for human review, never an accusation.
- Wallet-level results are tenant-scoped and authenticated. The public site only shows synthetic aggregates.
- Transaction signals (Red) and wallet context (Blue) are separate outputs. Blue is a contextual reputation estimate, not proof of identity or innocence.
- Customer policy decisions remain outside this service; a score does not automatically block a transaction.

See [architecture](docs/architecture.md), [API contract](docs/api-v1.md), [privacy design](docs/privacy.md), and [roadmap](docs/roadmap.md).
