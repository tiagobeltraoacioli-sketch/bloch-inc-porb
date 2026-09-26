# Graphus System Map and evidence workbench

The public [System Map](https://bloch-graphus.xyz/map) now connects 44 modules across source, normalization, data, graph, analysis and delivery layers. Ten modules belong to the AML workspace group. Thirty-nine capabilities are available, including linked private portal workflows; one prototype and four planned workflows are explicitly marked. These are implementation descriptions, not continuous uptime measurements.

## Module navigation

- Combine asset, layer, module group, implementation stage and text filters. Use the diagram or the responsive directory; both select the same module contracts. Filtered layers occupy only the columns they need.
- Inspect inputs, outputs, coverage, access and upstream/downstream dependencies. Diagram arrows open their data contract. References between modules are architecture dependencies, not wallet transfers.
- Open Constellation, Oculum, Analytics, the field catalog, Bloch Space and DaaS. Private links open `rednblue.space/portal/?view=analyses`, `?view=science` or `?view=access`; the portal preserves the requested screen through login.
- Share module URLs such as `/map?category=aml&module=aml-evidence`. Unsupported filter values are ignored and the registry restricts navigation to known module IDs and product routes.

### Map controls and details

**Fit map** fits every matching module into the available canvas, without horizontal overflow. Zoom buttons show the scale relative to that overview; selecting a module preserves the current zoom. **Focus module** centers the selection at a readable scale. Drag the background to pan, use Ctrl/Command + wheel to zoom, or focus the canvas and use arrow keys, `+`, `-` and `Home`.

The details panel opens beside the diagram on wide screens. On screens up to 1,100 px it opens as a scrollable dialog, so its actions stay reachable. Close it and use **Details** to reopen the same selection. **Clear selection** restores the unhighlighted overview. Phones start in Directory view; Map remains available.

**Expand workspace** opens the controls and diagram in a full-window dialog. **Exit expanded view** or Escape restores the original workspace. Native dialogs manage focus and prevent interaction with content behind them. Source-module **Capture … evidence** actions start the selected capture and return to its workbench, including from the expanded workspace.

### Current captured observations

The source panel reflects the current committed workbench capture: asset, record/page counts, source, highest sampled anchor and retrieval time. Its states distinguish no capture, collection in progress, completed capture, failed source request and cancellation. It does not run background queries or claim continuous source health.

Blue dots in the diagram and badges in the directory identify public modules that can open the current sample. The selected asset must match, and the module must support captured records. Private scores, access administration, research prototypes, Space series and independent balance queries do not receive these badges. A badge means a sample is available, not that a module ran or that a private score was calculated.

Applicable module inspectors show reference, transaction, returned-block and missing-timestamp counts, plus source coverage, finality, full anchor hash and dataset SHA-256. **Inspect captured records** returns to the workbench. **Graph captured sample**, **Analyze captured sample** and **Export captured JSON** reuse the exact full packet; workbench ledger filters do not alter these actions. **Load earlier sample pages** explicitly requests the next batch under the existing page limits. Graph/analysis handoffs do not issue another source query. If browser storage blocks a handoff, the workbench displays the export/import fallback and keeps the collection.

The panel updates after each committed page. A failed or canceled continuation keeps those pages and their original digest available, while reporting the interruption. Switching the capture asset or clearing the workspace removes stale indicators. Switching only a map filter never clears or changes the underlying capture. Captures remain in tab memory and are not a permanent multi-asset data store.

## Public integration API

`GET /api/system/map` returns schema version 1 of the central module registry: supported assets, layers, categories, implementation labels, module contracts, connections and per-asset action links. Registry version `2026-09-25.2` describes implementation availability, not current source health. No query parameters are accepted.

The registry endpoint and `GET /api/chain/network` permit credential-free browser reads through public CORS (`GET, OPTIONS`). Error responses on the network read retain these headers. Account/session, annotation and private portal routes do not inherit this CORS policy. These public endpoints do not require or accept a portal API key to authorize their public observations.

The native [Bloch Explorer System Map](https://blochl1.com/system-map) consumes the registry and network API directly in the browser. The BLCH adapter itself reads the explorer indexer; a server-side explorer → Graphus → explorer proxy would form a circular Worker path. Explorer code instead validates and packages the browser response using a pinned copy of the same evidence routines. Its full and filtered JSON exports can be opened by Graphus's existing local evidence import.

## AML evidence preparation

The workbench queries the existing public `/api/chain/network?asset=...` endpoint only when requested. BTC, ETH, Ethereum USDT/USDC and BLCH use their existing bounded source adapters. The private portal separately provides descriptive observation scores, investigations, explicitly evaluated watchlists and [official identifier evidence](aml-data-enrichment.md), under organization access controls. Public capture does not execute these private workflows. Automatic monitoring schedules, identity resolution and validated AML classification remain unavailable.

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
node --test tests/test_system_map_api.mjs tests/test_system_map.mjs tests/test_system_observation.mjs tests/test_evidence_graph.mjs tests/test_graphus_collection.mjs
PLAYWRIGHT_MODULE=/path/to/playwright/index.mjs node scripts/check_system_map_browser.mjs
GRAPHUS_MAP_ORIGIN=https://bloch-graphus.xyz PLAYWRIGHT_MODULE=/path/to/playwright/index.mjs node scripts/check_system_map_browser.mjs
PLAYWRIGHT_MODULE=/path/to/playwright/index.mjs node scripts/check_system_map_panel_browser.mjs
GRAPHUS_MAP_ORIGIN=https://bloch-graphus.xyz PLAYWRIGHT_MODULE=/path/to/playwright/index.mjs node scripts/check_system_map_panel_browser.mjs
PLAYWRIGHT_MODULE=/path/to/playwright/index.mjs node scripts/check_system_observation_browser.mjs
GRAPHUS_MAP_ORIGIN=https://bloch-graphus.xyz PLAYWRIGHT_MODULE=/path/to/playwright/index.mjs node scripts/check_system_observation_browser.mjs
```

Unit checks cover module contracts, fixed product routes, exact values, stripped fields, reproducible digests, cursor/anchor binding, atomic deduplication, page/record capacity, exact filters, subset lineage and comparisons with conflicting anchors. Local WebKit uses explicitly synthetic fixtures and checks module navigation, keyboard/connection selection, historical collection, baseline retention/comparison, filtered exports, ledger controls, partial failures/cancellation, asset-switch races, capacity, Analytics handoff and mobile layout. Live mode uses actual deployed APIs for all five assets, collects two pages and retries a failed public read once. The browser harness prints only aggregate counts, not private data.

Set `GRAPHUS_MAP_ASSETS=USDC` (or a comma-separated subset of the five supported assets) to repeat only a failed live source check. Live failures log the public response status, cursor and a bounded error-body excerpt for diagnosis.

The panel regression harness checks actual pointer clicks and SVG bounds at 1,440, 1,280, 1,024 and 390 px. It covers the formerly cropped last column, all 44 modules, zoom retention, focus, layer/search filters, empty results, expanded-view sizing, Escape, compact dialogs, dependency navigation, deep links and a source-module capture action. Local capture uses a fixture; production mode requests BTC from the real deployed endpoint. Screenshots remain in ignored `.data/system-map-panel/`.

The observation harness checks all five assets locally and BTC/ETH/BLCH in production by default; `GRAPHUS_MAP_ASSETS` selects an explicit subset. It verifies sample metadata, exact inspector exports despite ledger filters, module/asset boundaries, graph and Analytics handoffs without additional source queries, and phone inspection. Local fixtures additionally exercise failed continuation, retry, cancellation, late responses after an asset switch and unavailable browser storage. Screenshots remain in ignored `.data/system-observation/`.

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

### Responsive panel repair — 2026-09-24

Graphus release `0d02b8d5` publishes commit `677431b`. The reported clipping was reproduced against the prior production release: its fixed 1,020 px SVG hid eight modules at a 1,280 px viewport and 30 modules at 390 px. Selection also reset zoom, and compact layouts placed the inspector beneath the map.

All 23 contract/evidence/collection tests passed locally. Local and production WebKit panel checks passed at 1,440, 1,280, 1,024 and 390 px: all 44 modules fit, no horizontal canvas overflow, actual clicks reached the last column, selection preserved zoom, focus enlarged the selected module, and filters, dependencies, dialogs, Escape and expanded view worked. Desktop and phone screenshots were inspected for toolbar contrast and readable details. No browser page errors were reported.

The production source-module action closed both nested dialogs, restored the workspace and captured 58 real BTC records from one bounded page at `2026-09-24T22:43:56.413Z`. This check does not measure the other source adapters or continuous availability.

### Captured observations in the map — 2026-09-24

Graphus release `48909eae` publishes commit `219e2fe`. All 25 unit tests passed locally. The observation browser harness passed for all five assets with explicit fixtures; local regression checks also passed for the four map viewport widths and the historical-collection/baseline/filter workflows. Failure, cancellation, asset-switch and unavailable-storage scenarios retained or cleared evidence as specified.

Production WebKit verified the deployed observation panel with these real bounded samples:

| Asset | Returned records | References, including transaction nodes | Inspector handoff verified |
| --- | ---: | ---: | --- |
| BTC | 57 | 76 | Constellation |
| ETH | 24 | 42 | Analytics |
| BLCH | 844 | 49 | Constellation |

All three checks verified source metadata, exact full-packet exports despite ledger filters, asset isolation, private-module boundaries and zero additional source queries during inspector navigation or handoff. Constellation exports retained the original dataset digests. The BLCH check also verified the phone dialog and export; its production screenshot was inspected. No browser page errors were reported. These samples are observations at different retrieval times, not complete network totals or continuous source-health measurements.

### Native Explorer integration — 2026-09-24

Graphus release `d574fa04` publishes commit `1c6df13`: the central registry at `/api/system/map` and credential-free, read-only CORS on that endpoint and `/api/chain/network`. All 27 selected API/registry/evidence/collection tests passed. Private account and analysis endpoints remain outside this public CORS contract.

Explorer release `d407c8cb` publishes its commit `5e9fab4` at `https://blochl1.com/system-map`. The native React workspace loads the registry and captures directly from Graphus in the browser, avoiding a circular Explorer Worker → Graphus → Explorer indexer request. It includes module/dependency selection, source actions, bounded historical capture, exact reference filters, native graphs, source anchors, JSON export and sample comparison. Public navigation does not initiate chain captures. Private module actions open the existing authenticated portal.

Production browser checks verified all 44 modules without horizontal clipping at 1,440, 1,280, 1,024 and 390 px. Separate real captures returned BTC 75 records/81 references, ETH 24/42, BLCH 844/49, USDT 193/264 and USDC 278/257. Full and filtered packets validated; inspector navigation, search and exports made no additional source requests. Explorer's release notes record exact dataset and served-bundle hashes. These are separate bounded observations, not synchronized totals.

Token reads initially encountered intermittent HTTP 502 errors, including Cloudflare responses without CORS; later real browser captures succeeded. The targeted token runs completed their map/capture/export/mobile checks, but the final zero-page-errors assertion failed on access-control errors from Explorer's existing `posternlabs.com/g4rpc` header fallback. Do not describe the complete production smoke test as green. No fallback data or private scores were published.
