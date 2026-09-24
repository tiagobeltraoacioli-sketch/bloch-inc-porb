# Graphus Analytics Lab

The [Analytics Lab](https://bloch-graphus.xyz/analytics.html) extends the Graphus site in this repository's `graphus/` directory. It shares the existing `bloch-graphus` Cloudflare Pages project and public source API. No separate repository or backend deployment is needed.

## Data modes

- **Synthetic demonstration, the default:** deterministic BTC, ETH, USDT, USDC and BLCH fixtures, generated separately by asset. Each contains 144 address/script references and 864 connection records across up to 72 illustrative blocks. BTC and BLCH additionally contain 288 transaction nodes; inputs and outputs remain distinct typed records.
- **Imported observation:** an existing Constellation JSON export, opened from disk or transferred by the new “Open observation in Analytics” button. Imports are bounded to 2 MB and processed locally. The same-tab handoff is removed from session storage after reading. Source-reported metadata from a file is unverified, not authenticated evidence. Token log records are used once rather than counted again through their rendered graph edges. Native ETH balance-only observations remain graphs without transfer edges.
- **Indexed BLCH balances:** an explicit request to the existing `/api/chain/holders?asset=BLCH` endpoint. The reported source, retrieval time and block anchor accompany the result. No private pilot data, identity labels or AML scores are published. This does not introduce a new public source or enlarge the API's existing 64-script limit.

## Analysis and interaction

Graph filters select connection kind, inclusive block bounds, minimum integer base units and an optional selected reference's immediate neighborhood. Records without block metadata are excluded only when a block bound is applied. Charts, graph metrics, path searches and exports use the filtered graph.

The graph includes pan, zoom, fit, node inspection and a searchable equivalent reference list. The canvas renders up to 450 references by degree, plus selected path references. Visible and total record counts disclose any canvas limit; analysis and exports retain all bounded records. Paths follow edge direction with at most six steps. They are topological evidence paths, not chronological flow reconstruction or proof that value traveled between owners.

Six graph charts show returned records by block, distinct-neighbor degree, connection types, base-unit amount bands, a directed adjacency matrix and PageRank. Statistics include weakly connected components and directed density excluding self links and duplicate endpoint pairs. PageRank uses unique outgoing links, damping 0.85, dangling redistribution, at most 60 iterations and an L1 convergence threshold of `1e-9`. Self links are retained for PageRank and event counts but excluded from distinct-neighbor degree and density. These are structural metrics, not risk scores.

The indexed balance view adds a largest-balances chart, a Lorenz curve, Gini, HHI, top-one/top-ten shares and the returned sum's share of the indexed total. All concentration statistics use the **returned balances** denominator. A truncated ranking is labeled explicitly. Complete returned sets must reconcile exactly to the indexed total; inconsistent snapshots are rejected. A script hash is not a person or a proven owner.

Amounts and aggregates use `BigInt`. Chart ratios are rounded to six decimal places. Exact base units remain available in the ledger and downloads. Input and output sums remain separated by edge type; no combined transfer volume is inferred. The evidence ledger supports text search, block/amount sorting and pagination. CSV exports follow its search and sorting and neutralize spreadsheet formula prefixes. Analysis JSON includes the filtered graph, source metadata, metrics and filter parameters. Indexed balance CSV also includes its source anchor.

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

Publish from the `graphus/` working directory so Wrangler discovers its `functions/` API directory:

```sh
cd graphus
wrangler pages deploy . --project-name bloch-graphus --branch main
```

Confirm the deployment output includes the compiled Functions worker, then verify `/api/chain/holders?asset=BLCH` returns JSON. Deploying the static directory from the repository root misses the nested Functions directory and makes API paths fall back to HTML. Sibling products and private source directories are outside this artifact.
