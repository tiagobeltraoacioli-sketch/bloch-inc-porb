# Graphus real network feed

The public [Constellation](https://bloch-graphus.xyz/constellation.html), [Oculum](https://bloch-graphus.xyz/oculum.html) and [Analytics](https://bloch-graphus.xyz/analytics.html) use real public network references. The user explicitly authorized wallet-only identification on 2026-09-24. Graphus displays addresses, script hashes and transaction identifiers without attaching holder names, inferred identities, ownership clusters or AML scores.

## Constellation collection

The default view queries `/api/chain/network?asset=BLCH`. BTC, ETH, USDT and USDC can be selected directly. `next_cursor` permits an earlier bounded source page through the same endpoint's `cursor` parameter:

- **BTC:** first 20 transactions in a source best-chain block selected at least three confirmations deep, at most 24 inputs and outputs each. Earlier pages select the preceding block; they do not fill the unreturned transactions within a block. Best-chain membership is rechecked.
- **ETH:** first 24 eligible positive direct-value transactions from a source-finalized block, with matched successful receipts. Earlier pages select the preceding finalized block. Internal calls are not included.
- **USDT/USDC:** up to 512 fixed-contract Transfer logs in four source-finalized blocks; returned block hashes are checked against linked headers. An earlier page ends before the preceding window. Dense windows report their truncation explicitly.
- **BLCH:** 32 indexed transactions per page with the original source snapshot cursor, up to 3,000 input/output reference records. Cursor height/hash must match the returned source anchor. The separately queried finalized-height limit is applied when available; unavailable finality remains explicit.

Numeric block cursors are limited to 8,192 blocks behind the source's eligible head. The API keeps at most 32 recent/cursor responses per isolate for 30 seconds, coalescing identical requests. This cache is not an archival database.

Collection runs every 60 seconds while the tab is visible, or on explicit request. Earlier pages and latest observations merge in memory, with exact event deduplication and rejection of conflicting block hashes or event values. The collection is bounded to 1,200 references, 4,000 connection records and 32 distinct snapshots. Export or clear it to collect another sample. Reloading the page discards the in-memory collection. No background collector or complete-history coverage is claimed.

The canvas plots up to 450 references ranked by distinct-neighbor degree, plus selected and path references. All bounded records remain in exports and analysis. Circles are addresses/scripts, diamonds are transactions; node size reflects sample degree, not balance. Filters select block, record type, exact minimum amount and a direct neighborhood. The block activity bars, reference list and paginated evidence table provide non-canvas access. Directed path search is limited to six steps; it is topological and does not establish chronological value flow.

Collection JSON includes raw exact records and every contributing source snapshot. “Analyze this collection” transfers it locally through consumed session storage to Analytics. A collection JSON file can also be imported locally into Analytics (up to 6 MB, with the same graph limits). Imported provenance remains unverified. No file is uploaded. Saved workspace views can now reopen a real asset feed without requiring an address.

Address deep links retain the existing balance, UTXO evidence, token window and receipt inspectors. A failed address query leaves an empty source state. Generated examples are accessible through the explicit `?mode=demo` view or an existing synthetic wallet link.

## Oculum discovery and balance observations

BLCH continues to use the ranked public indexer snapshot. Other assets automatically discover up to 16 addresses from a bounded real network page, ordered by the number of returned connections. The zero EVM address is excluded from discovery. Further discovery adds addresses until the session's 64-identifier asset limit is reached. This selection is an activity sample, not a list of the network's largest holders.

`GET /api/chain/balances?asset=ETH&addresses=<comma-separated-addresses>` accepts 1–16 fixed-network addresses for BTC, ETH, USDT or USDC:

- Ethereum batches check mainnet chain ID and query all balances at one source-finalized block number, then recheck its hash. Token calls use the existing fixed issuer contract addresses. Separate batches can have different anchors.
- BTC batches use confirmed Esplora funded/spent aggregates in exact satoshis. They have no common pinned block. Unsafe integer inputs are rejected.
- Unavailable addresses are listed separately; they never become zero balances. Previously collected values retain their original retrieval times when refreshing fails.

The map and exact table keep source, retrieval time, block and discovery metadata. The distribution chart and largest share describe only the displayed sample. Refreshing records up to 24 balance observations per identifier in this tab. The selected-address chart uses collection order and exact base-unit differences; it does not reconstruct intervening transfers. JSON exports preserve source histories, and CSV exports preserve exact current balances and anchors. Automatic refresh runs every 60 seconds while visible and idle and can be disabled.

## Verification and deployment

```sh
node --test tests/*.mjs
GRAPHUS_URL=https://bloch-graphus.xyz \
  PLAYWRIGHT_MODULE=/absolute/path/to/playwright \
  node scripts/check_graphus_feed_browser.cjs
```

For a local static server, `GRAPHUS_ADAPTERS=1` runs the real source adapters through the browser test harness, using the public Ethereum RPC already used by project probes. It supplies actual public source responses, not invented records. The harness checks pagination, graph paths, exact exports, Analytics handoff, wallet discovery, balance refresh/history, mobile layout and source failure behavior. `GRAPHUS_CHECK_PART=balances` limits a follow-up check to Oculum and failure behavior.

Deploy from the `graphus/` working directory with its Functions directory present. See [deployment instructions](graphus-analytics-lab.md). Source APIs: [Esplora](https://github.com/Blockstream/esplora/blob/master/API.md) and [Ethereum JSON-RPC](https://ethereum.org/developers/docs/apis/json-rpc/). Source-reported finality and balances are not independent Graphus consensus verification.
