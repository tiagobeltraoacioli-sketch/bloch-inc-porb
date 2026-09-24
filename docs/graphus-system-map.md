# Graphus System Map and evidence workbench

The public [System Map](https://bloch-graphus.xyz/map) now connects 44 modules across source, normalization, data, graph, analysis and delivery layers. Ten modules belong to the AML workspace group. Thirty-five capabilities are available; the remaining operator prototypes and planned workflows are explicitly marked. These are implementation descriptions, not continuous uptime measurements.

## Module navigation

- Combine asset, module group, implementation stage and text filters. Use the diagram or the responsive directory; both select the same module contracts.
- Inspect inputs, outputs, coverage, access and upstream/downstream dependencies. Diagram arrows open their data contract. References between modules are architecture dependencies, not wallet transfers.
- Open Constellation, Oculum, Analytics, the field catalog, Bloch Space and DaaS. Private links open `rednblue.space/portal/?view=analyses`, `?view=science` or `?view=access`; the portal preserves the requested screen through login.
- Share module URLs such as `/map?category=aml&module=aml-evidence`. Unsupported filter values are ignored and the registry restricts navigation to known module IDs and product routes.

## AML evidence preparation

The workbench queries the existing public `/api/chain/network?asset=...` endpoint only when requested. BTC, ETH, Ethereum USDT/USDC and BLCH use their existing bounded source adapters. This does not activate a sanctions matcher, case manager, automatic monitoring schedule, identity resolver or AML classifier. Those modules retain their documented prototype/planned stages. The private Red/Blue portal provides descriptive observation scores under its existing model and organization access contract.

A capture validates network/asset identity, typed reference IDs, event identity, exact unsigned integer amounts, transaction IDs and block hashes. Conflicting block anchors and duplicate records are rejected. The browser caps source response bytes at 3 MB and applies a 65-second request deadline. Canceling or changing the selected asset invalidates the pending request. Errors clear the current capture and leave no synthetic replacement or stale export action.

The workbench displays reference, event, transaction and returned-block counts; missing timestamp counts; source block and finality text; charts by block and event type; and a searchable ledger with 20 records per page. Source amounts remain integer strings. Bitcoin base58 matching remains case-sensitive. Address links preserve asset context and open Graphus; transaction links use the corresponding public explorer.

## Export and analysis

Export uses the existing `graphus_network_collection` schema, with a sanitized dataset, one source snapshot, completeness diagnostics and `dataset_sha256`. The digest is SHA-256 of UTF-8 `JSON.stringify(dataset)` with field and array order preserved. It identifies the dataset bytes; it does not certify the upstream source or full-chain coverage. Explicit export flags state that no AML score or identity attribution is included.

The packet strips unrelated/private top-level, node and record properties. Token contract identity and source selection/omission metadata are preserved through an explicit scope-field allowlist. Missing timestamps remain missing. UTXO input and output records retain separate meanings and are not summed into a total-transfer claim.

“Analyze this capture” passes the packet through the existing, consumed `graphus.analytics.network.v1` session-storage handoff to `/analytics.html?import=network`. The imported packet is used directly; no replacement source query is required. If browser storage is unavailable, download the packet and use Analytics' JSON import. Captures otherwise remain in tab memory and disappear on clear or reload. No account or database is added to the public workbench.

## Verification and deployment

```sh
node --test tests/test_system_map.mjs
PLAYWRIGHT_MODULE=/path/to/playwright/index.mjs node scripts/check_system_map_browser.mjs
GRAPHUS_MAP_ORIGIN=https://bloch-graphus.xyz PLAYWRIGHT_MODULE=/path/to/playwright/index.mjs node scripts/check_system_map_browser.mjs
```

Unit checks cover module contracts, fixed product routes, combined filters, exact amounts, stripped fields, reproducible digests, conflicting anchors, source failures and body bounds. Local WebKit uses explicitly synthetic test fixtures and checks filters, deep links, keyboard module/connection selection, captures, exports, ledger search/pagination, cancellation, source failures, Analytics handoff and mobile layout. The live mode uses actual deployed APIs for all five assets and retries a failed public read once.

Deploy from `graphus/` with `wrangler pages deploy . --project-name bloch-graphus --branch main` so its existing Functions are included. The portal screen-link change deploys separately from `site/` to `rednblue-space`. Neither deployment contains private handoff files or operator research artifacts.
