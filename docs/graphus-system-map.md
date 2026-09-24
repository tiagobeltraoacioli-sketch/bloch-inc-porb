# Graphus System Map and evidence workbench

The public [System Map](https://bloch-graphus.xyz/map) now connects 44 modules across source, normalization, data, graph, analysis and delivery layers. Ten modules belong to the AML workspace group. Thirty-five capabilities are available; the remaining operator prototypes and planned workflows are explicitly marked. These are implementation descriptions, not continuous uptime measurements.

## Module navigation

- Combine asset, module group, implementation stage and text filters. Use the diagram or the responsive directory; both select the same module contracts.
- Inspect inputs, outputs, coverage, access and upstream/downstream dependencies. Diagram arrows open their data contract. References between modules are architecture dependencies, not wallet transfers.
- Open Constellation, Oculum, Analytics, the field catalog, Bloch Space and DaaS. Private links open `rednblue.space/portal/?view=analyses`, `?view=science` or `?view=access`; the portal preserves the requested screen through login.
- Share module URLs such as `/map?category=aml&module=aml-evidence`. Unsupported filter values are ignored and the registry restricts navigation to known module IDs and product routes.

## AML evidence preparation

The workbench queries the existing public `/api/chain/network?asset=...` endpoint only when requested. BTC, ETH, Ethereum USDT/USDC and BLCH use their existing bounded source adapters. This does not activate a sanctions matcher, case manager, automatic monitoring schedule, identity resolver or AML classifier. Those modules retain their documented prototype/planned stages. The private Red/Blue portal provides descriptive observation scores under its existing model and organization access contract.

A capture validates network/asset identity, typed reference IDs, event identity, exact unsigned integer amounts, transaction IDs and block hashes. Duplicate IDs within a page and conflicting block anchors are rejected. The browser caps each source response and serialized dataset at 3 MB and applies a 65-second deadline to each request. No failed request is replaced with synthetic data.

Choose one, two or four pages per operation. **Capture latest** starts a new collection; **Load earlier pages** follows the source cursor from the last committed page. A collection is limited to eight pages, 1,200 references and 4,000 unique records. BTC/ETH/token cursors bind each returned anchor to an earlier block; BLCH cursors bind pages to the original indexed snapshot. Every page keeps its requested cursor, source, retrieval time, anchor, scope and coverage. Sampling omissions remain explicit; earlier pages do not imply complete historical coverage.

Merging requires the same asset, network and source. Repeated events across pages are counted once only when all recorded fields agree. Conflicting event fields, reference identities, block hashes, unexpected/repeated cursors or capacity violations reject the incoming page without mutating the committed collection. Cancellation and request failures preserve completed pages for export or continuation. Changing the asset or clearing the workspace clears the collection and baseline and invalidates in-flight responses.

The workbench displays source-page, reference, event, transaction and returned-block counts; missing timestamp counts; source block and finality text; charts by block and event type; and a searchable ledger with 20 records per page. Select a chart bar to filter the ledger. Combine record type, block range, exact base-unit amount range and public-reference/transaction search. Incoming/outgoing filtering requires an exact graph reference. Source amounts remain integer strings and comparisons/sums use `BigInt`. Bitcoin base58 matching remains case-sensitive. Amount totals are separated by record type; UTXO inputs and outputs are not combined into a transfer-volume claim. Reference buttons open the same filtered records in Constellation and select that point. Transaction links use the corresponding public explorer.

## Baseline comparison

**Pin current as baseline** retains the current completed collection in tab memory. Extend the collection with earlier pages or start a new capture of the same asset. The comparison groups event IDs into only-current, only-baseline, changed-fields and same-recorded-fields categories. Category cards filter a paginated comparison ledger. Changed events expose both complete records, including amount, block, position, timestamp and outpoint fields. Overlapping heights with different block hashes are reported explicitly.

These differences describe sampled datasets. A record absent from one sample does not establish deletion or inactivity, and counts are not an activity delta over a time period. Export the baseline, current collection and comparison report to retain both datasets and their digests. A comparison report lists event IDs and aggregate metadata; it does not embed either full dataset. This is public-chain evidence comparison, not sanctions screening or an AML decision.

## Export and analysis

Export uses the existing `graphus_network_collection` schema, with a sanitized dataset, one snapshot per source page, completeness diagnostics and `dataset_sha256`. Full collections also include pagination metadata. The digest is SHA-256 of UTF-8 `JSON.stringify(dataset)` with field and array order preserved. It identifies the dataset bytes; it does not certify the upstream source or full-chain coverage. Explicit export flags state that no AML score or identity attribution is included.

The packet strips unrelated/private top-level, node and record properties. Token contract identity and source selection/omission metadata are preserved through an explicit scope-field allowlist. Missing timestamps remain missing. UTXO input and output records retain separate meanings and are not summed into a total-transfer claim.

Filtered exports retain only matching events and their endpoint references, with a new dataset digest, normalized filter parameters and the parent dataset digest. Source snapshots continue to describe the original sampled pages. Filtered subsets cannot be extended or used as full-collection baselines. Empty or invalid filters disable the filtered export and handoff controls.

“Analyze this capture” and “Analyze filtered records” pass the selected packet through the existing, consumed `graphus.analytics.network.v1` session-storage handoff to `/analytics.html?import=network`. The imported packet is used directly; no replacement source query is required. If browser storage is unavailable, download the packet and use Analytics' JSON import. Collections and baselines otherwise remain in tab memory and disappear on clear or reload. No account or database is added to the public workbench.

Full and filtered collections also open directly in Constellation through **Graph this collection** and **Graph filtered records**. The graph checks the dataset digest, retains source/filter lineage and pauses live collection while inspecting saved evidence. See the [saved evidence graph guide](graphus-evidence-graph.md).

## Verification and deployment

```sh
node --test tests/test_system_map.mjs
PLAYWRIGHT_MODULE=/path/to/playwright/index.mjs node scripts/check_system_map_browser.mjs
GRAPHUS_MAP_ORIGIN=https://bloch-graphus.xyz PLAYWRIGHT_MODULE=/path/to/playwright/index.mjs node scripts/check_system_map_browser.mjs
```

Unit checks cover module contracts, fixed product routes, exact values, stripped fields, reproducible digests, cursor/anchor binding, atomic deduplication, page/record capacity, exact filters, subset lineage and comparisons with conflicting anchors. Local WebKit uses explicitly synthetic fixtures and checks module navigation, keyboard/connection selection, historical collection, baseline retention/comparison, filtered exports, ledger controls, partial failures/cancellation, asset-switch races, capacity, Analytics handoff and mobile layout. Live mode uses actual deployed APIs for all five assets, collects two pages and retries a failed public read once. The browser harness prints only aggregate counts, not private data.

Set `GRAPHUS_MAP_ASSETS=USDC` (or a comma-separated subset of the five supported assets) to repeat only a failed live source check. Live failures log the public response status, cursor and a bounded error-body excerpt for diagnosis.

Deploy from `graphus/` with `wrangler pages deploy . --project-name bloch-graphus --branch main` so its existing Functions are included. The portal screen-link change deploys separately from `site/` to `rednblue-space`. Neither deployment contains private handoff files or operator research artifacts.

### Initial production verification — 2026-09-24

Graphus release `f76fcf6f` and portal release `7c2fbad6` are published. The five contract/evidence tests and both local browser flows passed. Production WebKit verified System Map filters, module links, keyboard interactions, connection contracts, exact exports, record searches, Analytics handoff and mobile layouts with these real one-page observations:

| Asset | References, including transaction nodes | Returned records | Records without timestamps |
| --- | ---: | ---: | ---: |
| BTC | 78 | 72 | 0 |
| ETH | 46 | 24 | 0 |
| BLCH | 49 | 844 | 844 |
| USDT | 388 | 317 | 317 |
| USDC | 377 | 352 | 352 |

These are changing source samples, not network totals. Missing source timestamps were retained as missing. A separate production browser check verified that the access/API deep link survives the authorized master login, that science and analysis links open their respective private screens with the existing session, and that logout succeeds. No credential was printed or included in the public release.

### Historical collection release — 2026-09-24

Graphus release `24321752` publishes commit `61a4a28`. Eleven unit tests passed. Local WebKit verified eight-page collection, exact filtering, immutable baselines, comparisons, exports, filtered Analytics handoff, mobile layouts, completed-page retention after failure/cancellation and asset-switch races.

Production browser checks collected and compared two real source pages for each asset:

| Asset | Source pages | References, including transaction nodes | Unique records | Baseline records | Records without timestamps |
| --- | ---: | ---: | ---: | ---: | ---: |
| BTC | 2 | 146 | 134 | 62 | 0 |
| ETH | 2 | 80 | 48 | 24 | 0 |
| BLCH | 2 | 81 | 910 | 844 | 910 |
| USDT | 2 | 644 | 511 | 215 | 511 |
| USDC | 2 | 548 | 680 | 287 | 680 |

Each check verified unique event IDs, exact amount filters, baseline/current digests, comparison counts, subset lineage and mobile overflow. The completed USDC browser run also verified the filtered packet's production Analytics handoff. These observations came from separate requests and represent bounded samples, not synchronized chain totals.

Temporary HTTP 502 responses interrupted the initial Ethereum capture and a later USDC historical page. Targeted reruns succeeded with real responses. The failed USDC continuation retained its first completed page and displayed the failure explicitly. No synthetic replacement was used. Missing token/Bloch timestamps remain absent in the exported records. This release deploys the public Graphus workbench; the existing private portal remains a separate service.
