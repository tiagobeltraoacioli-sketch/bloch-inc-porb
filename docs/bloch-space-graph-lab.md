# Bloch Space Graph Lab

`/graph/` is a public-chain evidence workbench for BLCH, BTC, ETH, USDT and
USDC. It uses the Graphus Bloch history and Ethereum token-activity adapters,
Bloch's historical indexer, Blockstream Esplora and the configured Ethereum RPC.
Each workspace contains one network and one asset. It does not infer owners,
cross-chain identities, traced funds or BI-PoRB risk scores.

## Exploration

- A fresh online visit loads one bounded recent sample. Add a transaction, Bitcoin address, Bloch
  script hash or Ethereum token address.
- Expand a selected reference, query up to three loaded neighbors, and page
  older address history where the source supports it. Cancel discards a pending
  batch. Five workspace undo states are retained in memory.
- Pan, zoom, use full screen, or switch between force, component-ring and
  block-timeline layouts. A searchable reference list provides keyboard access.
- Filter exact asset amounts, event type, block interval and one to three edges
  around a selected reference, with incoming/outgoing/both directions.
- Animate cumulative observations through loaded block heights. The timeline
  is not a statement about unobserved blocks or complete address history.
- Find up to five directed simple paths, with at most eight edges, 20,000 edge
  visits and 5,000 queued states. The optional ordering constraint rejects
  unknown chronology, descending blocks and unordered distinct transactions
  within a block. Input/output edges of the same UTXO transaction can connect.
  ERC-20 events within a transaction respect log order. These are structural
  paths, not attribution of particular funds.
- Compare loaded edge identifiers and amounts/block hashes with an in-memory
  snapshot. This compares workspace contents; it does not diagnose a reorg.

The capacity is 5,000 nodes, 12,000 edges and 200 source observations. Merging
validates the full result before changing the workspace. Duplicate events merge
their provenance; conflicting amounts, endpoints, transaction anchors or block
hashes are rejected. Loading another asset starts a separate graph.

## Source contract

`GET /api/graph?network=bloch|bitcoin|ethereum&asset=BLCH|BTC|ETH|USDT|USDC`
accepts `kind=recent|address|tx`, optional `query`, and an address-history
`cursor`. Asset and network must match. Unknown/duplicate parameters, arbitrary
URLs and malformed references are rejected before source calls.

| Source / query | Coverage |
| --- | --- |
| Bitcoin recent | First transaction page of a source-reported best-chain block, at most 25 transactions |
| Bitcoin address | Up to 25 confirmed transactions per Esplora cursor page |
| Bitcoin transaction | Exact requested transaction; unconfirmed transfers are withheld |
| Bitcoin graph positions | At most 32 inputs and 32 outputs per transaction; scripts without an address are omitted and counted |
| Bloch recent | Up to six indexed transactions, read independently |
| Bloch transaction | At most 256 inputs and 256 outputs; transaction index, block height/hash and separate finality scope |
| Bloch script history | Graphus validated 64-event cursor pages |
| Ethereum native recent | First six transaction IDs in a finalized source block; matching successful receipts required for value edges |
| Ethereum native address | Unavailable from the configured non-indexing RPC; explicitly shown without fabricated history |
| USDT / USDC recent | First 512 source-returned Transfer logs over four finalized blocks; window headers, parent links, event anchors and end-header recheck |
| USDT / USDC address | Graphus bounded activity window, with older block windows requested explicitly |
| Ethereum transaction | Direct ETH value/zero-value execution or supported token receipt events; no internal call tracing |

For UTXO networks, input and output edges retain a transaction node. An input
reference is not mapped directly to every output. Coinbase has no invented
sender. Ethereum value/log edges connect addresses; the separately inspectable
transaction reference can appear as an isolated node. Failed, unavailable or
inconsistent receipts do not create value-transfer edges.

Amounts are decimal integer strings in base units. `BigInt` is used for filters,
sums and formatting. ETH has 18 decimals, BTC/BLCH eight, and USDT/USDC six.
Inputs and outputs are reported separately and are never added as transfer
volume. Source-reported finality is separate from independent verification.

New direct reads time out after nine seconds and stop at 4 MiB per upstream
response. Existing Graphus adapters retain their own read bounds. The API shares
the explorer's per-isolate budgets of 30 client requests per minute and 300
total requests per minute. The browser reads at most 8 MiB per response, queries
at most three references per user action and aborts a batch after 55 seconds.
There is no automatic background crawler. These isolate budgets are not a
globally durable abuse-prevention system.

## Analysis and exports

A module worker calculates weak components, directed strongly connected cycle
groups, undirected k-core, unique-neighbor degree and PageRank (damping 0.85,
up to 40 iterations). It also computes exact per-type amount totals and block
event counts. Nine panels show rankings, distributions, components, event types,
block activity, adjacency among the top 12 references and capacity. PageRank and
k-core describe the filtered graph and are not financial, identity or risk scores.

Layouts and analysis run in the worker; the main thread handles Canvas 2D
rendering and interaction. Dense views omit most arrowheads until selection to
keep them legible. The ledger retains exact direction and every loaded event.

Evidence JSON exports the full workspace and observation ledger. CSV and GraphML
export the current filtered graph with provenance identifiers; use JSON for full
source metadata. PNG exports the visible canvas with its scope and a boundary
caption. CSV formula prefixes are neutralized and GraphML text is XML-escaped.
Imports are limited to 16 MiB, validated against the graph schema, labeled
unverified and kept read-only. Imported data never uploads or triggers expansion.
No workspace persists automatically; export before closing or reloading.

The PWA's version-three shell includes the graph page, worker and modules. No API
response, address query or account data is stored in the service-worker cache.
Saved evidence files can be inspected offline. Live expansions require a network.
The macOS 1.1 client adds **Workspace → Graph Lab**, shortcut **Command-5**.

## Verification

```sh
node --test tests/test_space_graph_lab.mjs tests/test_space_explorer.mjs tests/test_space_science.mjs tests/test_space_accounts.mjs tests/test_space_graphus.mjs
node scripts/test_space_graph_browser.mjs
```

The browser script supports `SPACE_TEST_URL`, `SPACE_PLAYWRIGHT_MODULE` and
`SPACE_CHROME_PATH`. It checks all five live assets, expansion, snapshot comparison,
path UI, exact-amount filtering, export/import, undo, three layouts, a 390-pixel
viewport and offline cache boundaries. A clearly marked synthetic test file
checks the 5,000-node / 12,000-edge capacity locally in the browser; it is never
published or served as chain data.

On 24 September 2026, 49 focused tests passed. The five local source checks
returned nonempty evidence, with no page JavaScript/CSP errors or mobile overflow.
The capacity fixture rendered and analyzed in approximately four seconds in
Chrome on the development Mac. This is a measured example, not a performance
guarantee for other devices.

Source API references: [Esplora API](https://github.com/Blockstream/esplora/blob/master/API.md)
and [Ethereum JSON-RPC](https://ethereum.org/en/developers/docs/apis/json-rpc/).

## Published verification — 24 September 2026

Deployment `b2f5116c.bloch-space.pages.dev` is served at `bloch.space`.
The complete browser suite passed on the public domain: all five live asset
samples, expansion, comparison, paths, amount filtering, JSON export/import,
undo, layouts, mobile sizing, capacity and an offline PWA reload. The capacity
fixture completed in 3.7 seconds on the development Mac. No application
JavaScript or CSP errors occurred. An infrastructure-injected Cloudflare
analytics beacon was blocked by the existing self-only script policy; that
policy was not relaxed. A previous run encountered a transient HTML gateway
response; the client now reports that condition without losing loaded evidence.

The previous research/account browser suite also passed locally, including
temporary registration, login, saved preferences, logout, deletion and offline
cache boundaries. Temporary test accounts were deleted.

The published macOS 1.1.0 ZIP matched the validated local universal build:
`60d3b5a4269fbe3398ac7ba294629032cc5c4ebe027d66a00a86d491c654da52`.
The app passed strict code-signature verification, and its binary contains
x86_64 and arm64. It remains an ad-hoc development build, not Apple-notarized.
macOS denied overwriting the installed app even outside the restricted command
environment. The old installed bundle remained intact and passed signature
verification; the new package is available at `/downloads/` for manual installation.
