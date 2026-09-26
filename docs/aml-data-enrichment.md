# Private evidence enrichment and research API — 2026-09-25

This release adds official identifier evidence, a separate unsupervised neighborhood baseline, shared evidence profiles and partner research endpoints. All customer results remain organization-private. Public Graphus receives descriptive chain/sample measurements only.

## Collect more observed data

The portal accepts 1–8 source pages per analysis, retaining the existing ceilings of 1,200 references and 4,000 unique records. Whole incoming pages that exceed capacity are rejected; previously completed pages retain their provenance. Eight pages do not imply eight fully indexed blocks or complete address history. Source failures remain failures.

## Neighborhood baseline

`porb-observation-1.1.0` preserves the original eight features and unchanged Isolation Forest and Blue definitions. A separate `porb-neighbors-1.0.0` baseline standardizes varying features by their population standard deviation and computes the mean Euclidean distance to ten other references. Constant dimensions are excluded. At least 20 observed references and three distinct feature vectors are required.

The baseline retains the three nearest feature references and the midrank percentile of each mean distance. It fits the same bounded asset cohort as Red, without labels. Feature neighbors need not be transaction counterparties. Percentiles are not probabilities, accuracy estimates or AML classifications. Older runs remain unchanged and explicitly report unavailable neighborhood results. No supervised AML model or validated detection performance is claimed.

## Official identifier evidence

An analyst or administrator opens a saved analysis and selects **Check official identifiers**. The connector reads the [official OFAC Sanctions List Service](https://ofac.treasury.gov/sanctions-list-service) SDN CSV and supplementary remarks CSV. It follows only the observed SLS government-region publication bucket, requires matching publication paths, bounds each file to 16 MB and each fetch chain to 25 seconds, and parses quoted CSV and the official trailing DOS EOF marker. Source failures, oversized responses and inconsistent publications cannot become a no-match result.

The parser joins each primary remarks field directly to its one-to-one supplementary continuation by entry ID, without inserting whitespace, before extracting identifiers. This preserves labels and addresses split at the primary field's 1,000-character boundary, as documented in the [OFAC flat-file tutorial](https://ofac.treasury.gov/sdn-list-data-formats-data-schemas/tutorial-on-the-use-of-list-related-legacy-flat-files). Duplicate entry rows and orphan supplementary rows fail closed.

Only the remarks identifiers, source entry IDs and symbol tags are retained by the parser. Names and other personal fields are discarded. The report preserves original endpoint URLs, SHA-256 of fetched file bytes, last-modified headers, retrieval/expiry times, publication path, source row counts and the saved dataset digest. Signed download query parameters are not retained. A warm runtime can share a source snapshot for up to six hours; no tenant query or credential is sent upstream.

Matching distinguishes:

- `potential_exact_identifier_match`: a comparable address matches a listed identifier. Network, listing status and applicability still require review.
- `no_exact_identifier_match_in_snapshot`: no exact match among comparable identifiers in this snapshot.
- `not_covered`: this asset/reference type cannot be compared to the retrieved identifier set.

Bitcoin `XBT` and `BTC` tags are aliases; Base58 remains case-sensitive and uniformly cased Bech32 is normalized. EVM hex identifiers are normalized. ETH identifiers are compared as Ethereum address context for the configured Ethereum USDT/USDC assets; token-symbol entries still require independent network verification. BLCH script hashes are not treated as listed wallet addresses. No name matching, ownership resolution, indirect exposure, 50-percent ownership analysis, UN/EU/UK feed or automatic compliance decision is implemented. OFAC states that its [digital currency identifiers are not exhaustive](https://ofac.treasury.gov/faqs/562); absence is not clearance.

The latest report is retained separately from scores in `analysis_enrichments`, removed when its source analysis is removed, and replaced only after a successful refresh. GET returns the last report with `source_expired` and `policy_outdated`; it never silently refreshes. POST requires `data:read`, `analyses:read`, `scores:read` and `analyses:write`, with budgets of three requests/minute and 24/day per organization. GET requires the three read scopes. The report does not change Red/Blue or existing investigation snapshots. Export the report to retain it beyond analysis retention.

`report_digest` is SHA-256 over UTF-8 `JSON.stringify(report)` in returned property order, excluding the added `report_digest`, `source_expired` and `policy_outdated` fields. It identifies report bytes, not the truth or legal effect of the underlying observations.

## Shared evidence profiles

System Map, Constellation and the portal derive a `graphus-evidence-1.0.0` profile from the same captured records: timestamp availability/window, returned block range, heights without returned records, exact totals separated by record type, zero-value/self-reference records and incoming/outgoing/reciprocal adjacency. Unreturned heights are unknown, not empty blocks. UTXO adjacency is to transaction nodes, not inferred counterparties or beneficial owners.

Oculum adds sample top-five share, concentration HHI, exact total, missing anchors and retrieval-time spread. Mixed asset, network, contract or units are rejected. A shared block hash is required before a sample is described as sharing one anchor. Its research link sends only asset and public reference to the private portal, where the reference form is prefilled; scores and credentials are never included.

## Partner API and keys

The existing **Access & API** page issues organization-scoped keys once, with expiry and immediate revocation. Permission presets now cover read-only research, collection/enrichment, investigations/watchlists and custom scopes. The former four-scope validation cap is corrected to support all eight existing scopes. Presets do not add privileges beyond those selected; an active owner/admin creator remains required.

The API advertises version `1.2` and documents 38 operations, including:

| Operation | Behavior |
| --- | --- |
| `GET /v1/capabilities` | Supported assets, bounds and the caller's granted scopes; no source request |
| `POST /v1/references/batch` | Read-only search of up to 25 same-asset references; 1–5 latest indexed runs per reference |
| `GET /v1/analyses/{id}/profile` | Descriptive evidence profile and source snapshots; legacy profiles can be derived without modifying saved scores |
| `GET /v1/analyses/{id}/ml` | Saved model configuration, availability, scaling, clustering and statistics |
| `GET /v1/analyses/{id}/neighbors?reference=...` | Three saved nearest feature references, mean distance and percentile |
| `POST /v1/analyses/{id}/enrichment` | Create or refresh official identifier evidence |
| `GET /v1/analyses/{id}/enrichment` | Read the retained report and expiry state |

Batch results preserve input order after normalization/deduplication, keep deterministic created-at/id ordering and disclose retained/indexed analysis counts. No-match does not mean inactivity. Batch queries have a separate 20/minute organization budget and require both analysis and score read permissions, despite using POST. Private responses remain no-store, with strict scope checks and tenant filters. Machine-readable details and examples are at `/developers/` and `/developers/openapi.json`.

## Verification

Unit tests cover deterministic/scale-invariant neighbor results, sparse/constant cohorts, exact amount profiles, source parsing/publication/freshness failures, tenant and scope isolation, read-only batching, API key revocation, all eight key scopes, eight-page collection, old saved runs and unchanged Red/Blue outputs. Browser fixtures are explicitly synthetic.

The live read-only connector check at 2026-09-26 01:12 UTC retrieved 19,391 SDN rows, 36 supplementary rows and 1,048 distinct entry/symbol/address tuples. These are one source snapshot's counts, not screened customers or a coverage claim. SDN SHA-256: `cf3ffced4675aa1542f616a15c285266bd0466d8d4508c08a1aa9851a639b276`; supplementary SHA-256: `8255ce1eb2b85e08bac9e378eb8b28c59ca4926a3645f9421502cc11d48b86f1`.

An explicit synthetic capacity benchmark of 1,200 references/4,000 records took approximately 521 ms locally for scoring and produced a 1.95 MB score document. This is not a production latency or model-quality measurement.

```sh
node --test tests/test_porb_research.mjs tests/test_porb_enrichment.mjs tests/test_porb_neighbors.mjs tests/test_evidence_profile.mjs tests/test_porb_model.mjs
node scripts/build_partner_docs.mjs
python3 scripts/build_portal_modules.py
PLAYWRIGHT_MODULE=/path/to/playwright/index.mjs node scripts/test_porb_browser.mjs
PLAYWRIGHT_MODULE=/path/to/playwright/index.mjs node scripts/check_system_observation_browser.mjs
PLAYWRIGHT_MODULE=/path/to/playwright/index.mjs node scripts/check_enrichment_browser.mjs
node scripts/check_enrichment_source.mjs
```

Apply additive migration `0003_enrichment.sql` before deploying the private portal. Portal and public Graphus deploy independently; the public site has no enrichment report endpoint or private results. Source research files and screenshots remain ignored under `.data/` or outside the repository.

## Published release verification

Commit `2b70f30` is published as portal deployment `977c6930` and Graphus deployment `058d9da8`. The additive D1 migration `0003_enrichment.sql` succeeded. At 2026-09-26 01:27 UTC, the custom portal domain advertised API `1.2`, model `porb-observation-1.1.0`, and OpenAPI `1.2.0` with 38 operations. The seven added operations rejected anonymous access with HTTP 401, request IDs and no-store headers. Published portal/enrichment and Graphus evidence/Oculum JavaScript matched the local release bytes. The public registry reported version `2026-09-25.2` and 44 modules.

All 74 selected local unit/API tests passed, together with portal, observation and enrichment WebKit checks. Both GitHub workflows passed: [Private portal checks](https://github.com/tiagobeltraoacioli-sketch/bloch-inc-porb/actions/runs/36208315060) and [System Map contracts](https://github.com/tiagobeltraoacioli-sketch/bloch-inc-porb/actions/runs/36208315054).

A production WebKit run captured bounded real observations for all five assets and verified the original packet through inspector exports and Constellation/Analytics handoffs, without additional source requests:

| Asset | References, including transaction nodes | Returned records | Destination |
| --- | ---: | ---: | --- |
| BTC | 111 | 114 | Constellation |
| ETH | 40 | 24 | Analytics |
| BLCH | 51 | 844 | Constellation |
| USDT | 279 | 222 | Analytics |
| USDC | 289 | 270 | Constellation |

These are separate, changing source samples, not network totals or synchronized observations. The run also passed mobile inspection and reported no page errors. No production owner credentials or signed-in browser were available in this workspace, so authenticated production key issuance and enrichment persistence were not re-executed. Those paths, including tenant/scope isolation and revocation, passed the local API and browser tests. No production key was generated for this release check.


### Follow-up parser and persistence correction

Independent review identified that the first parser treated supplementary remarks as separate text. Policy `ofac-identifiers-1.0.1` now joins the two fields exactly before matching. Reprocessing the same downloaded bytes yields 1,058 identifiers across 20 symbols: 17 complete identifiers recovered and seven truncated fragments removed from the former 1,048 count. The recovered identifiers include nine XBT and two ETH records. No source addresses or names are included in this verification record.

Retained reports from policy 1.0.0 are returned unchanged with `policy_outdated: true`, and the portal asks for an explicit refresh. File hashes and original report digests stay intact. The persistence transaction now writes the audit entry only while its analysis exists and verifies that one report was stored before returning HTTP 201; retention during source fetching returns `analysis_unavailable` instead of a false success.

Regression coverage includes identifiers and labels split at four positions for BTC/Ethereum, duplicate entry IDs, stale-policy reports and deletion during a source fetch. The developer page also includes read-only batch/profile/ML examples and explicit enrichment refresh/read examples, with the current eight-page limit.


The parser/persistence correction is published in portal deployment `e48a0632` from commit `5bb361c`. Its 62-test portal/API regression selection and full portal WebKit workflow passed, including display and refresh of outdated reports. Graphus remains on deployment `058d9da8`.

### Embedded Graphus repair

A subsequent user report identified blank Graphus iframes while **Full window** worked. The Pages routing manifest included only `/api/*`, so module requests skipped the middleware and received the global `X-Frame-Options: DENY` and `frame-ancestors 'none'` policy. Routing now also includes `/graphus/*`. The middleware wraps the upstream response using its body and response options, preserving the HTML, content type and canonical-path redirects before setting same-origin framing headers. HTML module pages still require a portal session.

The browser harness now reads the deployed routing/header files, invokes the actual module middleware, and exercises `.html` to extensionless redirects. All six embedded modules render within the portal without using **Full window**. Middleware regressions verify HTML preservation, framing headers and redirect status/Location. CI now also runs when routing or static header rules change.
