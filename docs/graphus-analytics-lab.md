# Graphus Analytics Lab

The [Analytics Lab](https://bloch-graphus.xyz/analytics.html) extends the Graphus site in this repository's `graphus/` directory. It shares the existing `bloch-graphus` Cloudflare Pages project and public source API. No separate repository or backend deployment is needed.

## Data modes

- **Real recent chain records, the default:** the page automatically queries `/api/chain/network?asset=BLCH`. All five assets can be selected without supplying an address. BTC uses 20 transactions from a block selected at three source-reported confirmations, with up to 24 inputs/outputs per transaction and a best-chain recheck. BLCH uses the latest 32 indexed transactions, capped at 3,000 connection records and a bounded reference set. A separate finalized-height query is applied when available; its failure leaves finality explicitly unknown. ETH uses up to 24 positive direct-value transactions in a source-reported finalized block, requiring matched successful receipts. USDT/USDC use up to 512 fixed-contract Transfer logs in four consecutive finalized blocks. Block anchors are checked before rendering. Omitted record counts and sampling rules accompany each response. No dedicated BTC/ETH node is claimed as synchronized by these public adapters.
- **Real address query:** the address form calls the existing public wallet and token activity endpoints directly. Exact source balances and bounded graphs are displayed without exporting/importing a file. Native ETH address lookup remains balance-only; its recent-network graph is the separate direct-value block sample above. Address URLs can be revisited, and reference inspection links to Constellation. Optional automatic network refresh runs every 60 seconds while the tab is visible; a refresh replaces the sample and resets its filters. Source failures preserve the last visible dataset or an empty error state, never substitute synthetic records.
- **Real network collection:** Constellation can accumulate recent and earlier pages, deduplicate their records and hand the bounded collection to Analytics locally. Collection files up to 6 MB are also importable; disk-imported source claims remain unverified. Each contributing source snapshot is preserved in analysis JSON. See [collection and Oculum discovery](graphus-real-network-feed.md).
- **Synthetic demonstration, explicit opt-in:** deterministic BTC, ETH, USDT, USDC and BLCH fixtures, generated separately by asset. Each contains 144 address/script references and 864 connection records across up to 72 illustrative blocks. BTC and BLCH additionally contain 288 transaction nodes; inputs and outputs remain distinct typed records. Use the demonstration button or `?mode=demo&asset=ETH`.
- **Imported observation:** an existing Constellation JSON export, opened from disk or transferred by the new “Open observation in Analytics” button. Imports are bounded to 2 MB and processed locally. The same-tab handoff is removed from session storage after reading. Source-reported metadata from a file is unverified, not authenticated evidence. Token log records are used once rather than counted again through their rendered graph edges. Native ETH balance-only observations remain graphs without transfer edges.
- **Indexed BLCH balances:** an explicit request to the existing `/api/chain/holders?asset=BLCH` endpoint. The reported source, retrieval time and block anchor accompany the result. No private pilot data, identity labels or AML scores are published. This does not introduce a new public source or enlarge the API's existing 64-script limit.

## Analysis and interaction

Graph filters select connection kind, inclusive block bounds, minimum integer base units and an optional selected reference's immediate neighborhood. Records without block metadata are excluded only when a block bound is applied. Charts, graph metrics, path searches and exports use the filtered graph.

The graph includes pan, zoom, fit, node inspection and a searchable equivalent reference list. The canvas renders up to 450 references by degree, plus selected path references. Visible and total record counts disclose any canvas limit; analysis and exports retain all bounded records. Paths follow edge direction with at most six steps. They are topological evidence paths, not chronological flow reconstruction or proof that value traveled between owners.

Six graph charts show returned records by block, distinct-neighbor degree, connection types, base-unit amount bands, a directed adjacency matrix and PageRank. Statistics include weakly connected components and directed density excluding self links and duplicate endpoint pairs. PageRank uses unique outgoing links, damping 0.85, dangling redistribution, at most 60 iterations and an L1 convergence threshold of `1e-9`. Self links are retained for PageRank and event counts but excluded from distinct-neighbor degree and density. These are structural metrics, not risk scores.

The indexed balance view adds a largest-balances chart, a Lorenz curve, Gini, HHI, top-one/top-ten shares and the returned sum's share of the indexed total. All concentration statistics use the **returned balances** denominator. A truncated ranking is labeled explicitly. Complete returned sets must reconcile exactly to the indexed total; inconsistent snapshots are rejected. A script hash is not a person or a proven owner.

Amounts and aggregates use `BigInt`. Chart ratios are rounded to six decimal places. Exact base units remain available in the ledger and downloads. Input and output sums remain separated by edge type; no combined transfer volume is inferred. The evidence ledger supports text search, block/amount sorting and pagination. CSV exports follow its search and sorting and neutralize spreadsheet formula prefixes. Analysis JSON includes the filtered graph, source metadata, metrics and filter parameters. Indexed balance CSV also includes its source anchor.

Real network graph exports preserve transaction IDs, per-record block hashes, available outpoints and source snapshot metadata. The ledger links transactions to their public explorers. The public endpoint accepts only the five fixed asset names, bounds upstream response bytes, and coalesces source queries per asset for 30 seconds. RPC credentials remain server-side. The API publishes public chain facts only; private pilots, identity fields, customer cases and AML scores remain outside this scope.

## Development and verification

The frontend requires no build or added dependency:

```sh
python3 -m http.server 8096 --bind 127.0.0.1 --directory graphus
node --test tests/*.mjs
```

The browser check requires an existing Playwright installation with WebKit:

```sh
PLAYWRIGHT_MODULE=/absolute/path/to/playwright node scripts/check_graphus_analytics.cjs
```

The default check uses a local, mocked holder response. It exercises charts for all five assets, path search, filters, pagination, CSV download, exact large-amount imports, rejection of bad imports, a consumed session handoff and mobile layout. To verify deployment against the actual holder endpoint:

```sh
GRAPHUS_URL=https://bloch-graphus.xyz LIVE_SOURCE=1 \
  PLAYWRIGHT_MODULE=/absolute/path/to/playwright node scripts/check_graphus_analytics.cjs
```

Check automatic real-data loading, all five assets, exact exports, mobile layout and source failure behavior:

```sh
GRAPHUS_URL=https://bloch-graphus.xyz \
  PLAYWRIGHT_MODULE=/absolute/path/to/playwright node scripts/check_graphus_real_browser.cjs
```

Adapter references: [Esplora API](https://github.com/Blockstream/esplora/blob/master/API.md) and [Ethereum JSON-RPC](https://ethereum.org/developers/docs/apis/json-rpc/). A finalized tag or best-chain response is a source claim; these bounded adapters do not independently replay consensus.

Publish from the `graphus/` working directory so Wrangler discovers its `functions/` API directory:

```sh
cd graphus
wrangler pages deploy . --project-name bloch-graphus --branch main
```

Confirm the deployment output includes the compiled Functions worker, then verify `/api/chain/holders?asset=BLCH` returns JSON. Deploying the static directory from the repository root misses the nested Functions directory and makes API paths fall back to HTML. Sibling products and private source directories are outside this artifact.

## Verified release: 2026-09-24

Deployment `35f1567f` includes the Functions worker and real-data default. The 22 targeted adapter, API and analytics tests passed. Production WebKit checks loaded all five assets, preserved transaction and block identifiers in exports, passed mobile layout checks, and confirmed that a source error never substitutes synthetic records. The observed sample contained BLCH 844, BTC 61, ETH 24, USDT 304 and USDC 265 connections; these are changing bounded samples, not chain totals. Real BLCH and USDC address form queries and an ETH address deep link also passed, including exact source balance display.

Dedicated-node status was checked separately at 13:07:48 UTC: Bitcoin was still in initial block download (862,869 blocks, 968,395 headers, verification progress 76.7973%); Ethereum was still executing at 26,041,999. A public Ethereum head observation at 13:09:13 UTC was 26,047,519, approximately 5,520 blocks ahead of that earlier local reading. Erigon's 26,042,999 highest-block field was an internal stage target, not the public network tip. Private BTC/USDT/USDC ranking artifacts remained unbuilt. The deployed recent-network adapters use public sources and do not depend on those nodes finishing synchronization.
