# Bloch Space explorer

`space/` is the standalone Cloudflare Pages project for the Bitcoin, Ethereum,
and Bloch explorer. It uses the Bloch Inc identity and keeps every result tied
to its network, source, retrieval time, and coverage boundary. Graphus chain
adapters are imported directly for public address and script lookups.
The interface currently opens in a light palette for visual comparison: white
surfaces, dark text, lime accents, and the original Bloch Inc logo on a black
header plate. A header button restores the dark palette and remembers the
choice in the browser.

The primary data app is served at `/app/`. Its clickable Bitcoin, Ethereum,
and Bloch icon cards switch the entire live workspace without reloading the
page. Overview and Analytics are app views, with network, view, and range
stored in the URL for deep links and browser navigation. It refreshes the
visible source window every 60 seconds and offers exact source rows and CSV
for analytics windows. The home page links directly into the app for each
network. The network tabs lower on the home page still switch the unified
record explorer's active query network.
The app's persistent desktop sidebar (horizontal scroll rail on narrow screens)
selects source-backed subpages. Bitcoin has Overview, Blocks, Mempool & Fees,
Transactions, Analytics, and Sources. Ethereum has Overview, Blocks, Gas &
Finality, Transactions, Analytics, and Sources. Bloch adds Transactions, Fees &
Stake, Holders, Validators, Analytics, and Sources. Each sidebar selection
changes the app view and URL in place. Tables in each view can be downloaded as
CSV; analytics CSV preserves raw numeric source fields. The Bloch validator
view pages through 32 registry indices while keeping unavailable records
explicit. A source response is reused for up to 45 seconds when moving between
subpages that read the same endpoint; Refresh forces a new request. The
retrieval time remains visible. Source provenance and raw responses remain
visible in every view.
Dedicated legacy data pages remain at `/bitcoin/`, `/ethereum/`, and `/bloch/`.
They share the read-only `/api/overview` response and link each shown record
back to the unified explorer. The Bitcoin page charts recent block transaction
count and size plus the highest source mempool fee bins. The Ethereum page
charts bounded gas use and base fee history while keeping latest and finalized
RPC reads distinct. The Bloch page shows the network head, verified indexer,
validator and stake claims, recent transactions, funded script references,
mempool, observer diagnostics and recorded chain-change signals, monitored
connection distribution, and a six-hour connection series. Peer figures count
reported sockets across monitored nodes, not unique peers. Each additional Bloch source is optional;
its absence does not erase the validated head or indexer response. The Bloch
`getsupply` RPC is not served by the current public implementation, so the
page does not invent a live supply figure. These pages do not mirror every
feature of blochl1.com; additional datasets require their own validated
source boundaries.
The Bloch page also reads the existing public validator aggregator in 32-index
pages, keeping missing indices visible. It shows own and effective stake per
record and a chart limited to the current page. The API omits the aggregator's
upstream host details and never fans out validator reads from a viewer's
browser to consensus nodes.
Each network also has an `/analytics/` page. Bitcoin offers 10 or 30 linked
best-chain blocks; Ethereum offers 12 or 48 JSON-RPC fee-history blocks
anchored to a requested execution height; Bloch offers 6-hour, 24-hour and
7-day monitored-connection windows. Charts keep a table of every returned
point, a CSV download, a visible source boundary, and the full read-only API
response. Bloch charts preserve missing samples and interrupt connection lines
when the reporting-node count changes. These bounded observations do not
establish unique peers, sender ownership, complete chain history or finality.

## Live read surfaces

| Network | Overview | Block and transaction | Public reference |
| --- | --- | --- | --- |
| Bitcoin | Blockstream Esplora best-chain blocks, recent block transaction and size charts, mempool fee-depth histogram, bounded recent mempool entries and fee estimates | Esplora block, transaction, outspend facts, source-head confirmation depth, virtual size, fee rate and sequence replacement signal | Graphus Esplora address aggregate and bounded confirmed transaction graph |
| Ethereum | Configured mainnet JSON-RPC latest/finalized blocks, gas price, and optional 12-block gas-use and base-fee history | JSON-RPC block and identity-checked receipt; confirmation depth, execution and blob gas fees, allowlisted USDT/USDC Transfer events and separate finalized checkpoint | Graphus ETH/USDT/USDC finalized-block balance; bounded ERC-20 Transfer logs |
| Bloch | Bloch Explorer network head, epoch-position and finality markers, validator/stake/mempool claims, and verified historical indexer | Bloch Explorer slot/block and indexer transaction receipts with indexed depth and finalized-height comparison | Graphus 64-hex script-hash lookup, bounded history and evidence edges |

The API is read-only and validates network, record type, identifier, asset, and
parameter count before a source call. Responses are capped at 3 MiB, have an
8.5-second source timeout, and are not stored in a shared cache. The Pages
function applies a short-lived per-isolate request budget. This budget is
best-effort across isolates; durable quotas require a shared governor.

`GET /api/overview?network=bitcoin|ethereum|bloch`

`GET /api/series?network=bitcoin|ethereum|bloch&range=<10|30, 12|48, or 6h|24h|7d by network>`

`GET /api/block?network=...&query=<height, slot, or block hash>&offset=<optional transaction offset>`

`GET /api/tx?network=...&query=<transaction hash>`

`GET /api/address?network=...&asset=BTC|ETH|USDT|USDC|BLCH&query=<address or Bloch script hash>`

`GET /api/history?network=bloch&query=<64-hex script hash>&cursor=<optional opaque cursor>`

`GET /api/validators?network=bloch&offset=<optional multiple of 32>`

Bloch history pages contain at most 64 validated indexed events and their
source anchor when available. The cursor is opaque and limited to 160 URL-safe
characters. The page response is a separate source observation without a
balance claim. The address view can load further pages when the first page
returns a cursor. It keeps each page's retrieval time and anchor visible and
refuses to combine pages with a changed reported anchor or overlapping events.

The browser pages block transaction IDs in groups of 32, bounds graph edges,
and shows up to 32 UTXOs for Bitcoin and Bloch identifiers when those separate
source queries respond. It retains
exact base-unit strings in source responses; decimal rendering is a view only.
Address results show a newest-first activity timeline with clickable transaction
IDs. Bitcoin rows are the first source page of confirmed transaction IDs; they
do not assign input ownership or calculate wallet net flow. Bloch rows are
created-output or spent-outpoint-reference events from the first indexed
script-hash history page, with exact base-unit values. USDT and USDC rows are
allowlisted Transfer logs within the bounded finalized block window. ETH native
balance lookups have no transaction index, so the page explicitly marks activity
as unavailable. The timeline pages its returned sample locally and states the
source boundary; it does not claim complete address history.
Overview and record views include a collapsible raw API response. The rendered
preview is limited to 120,000 characters to bound the page, while copy and
download use the complete response. The panel links to the canonical read-only
API URL, including address asset and block transaction offset. Opening that URL
queries the source again and may return a different snapshot.
Observed graph points can open their source address, Bloch script reference, or
transaction with a pointer or keyboard. A point is interactive only when the
source supplied a valid identifier for that network.
Record views provide copy controls for the exact identifier and a canonical
`bloch.space` link. The link preserves the network, record type, asset for
addresses, and block transaction page offset.
Block records link to their source-reported parent when available. Transaction
records link to the containing block, Ethereum sender and recipient, and
allowlisted token transfer parties. Long transaction input, output, and receipt
log lists can be expanded in bounded batches without hiding the total count.
Successful searches, network changes, block transaction pages, and related
record links create browser history entries. Back and Forward restore the
network, record kind, asset, and block offset from the URL. Background overview
refreshes do not create history entries.
The selected network overview refreshes every 60 seconds while the page is
visible, including when a record is open. Manual Refresh uses the same read-only
request. The current charts and metrics remain visible during refresh; a failed
refresh labels the last successful snapshot stale and retains its retrieval
time. Returning to a visible tab refreshes data when the last success is older
than 60 seconds.
An address, script hash, or UTXO reference is not a person or a complete wallet.
Bitcoin confirmation is probabilistic. Ethereum receipt success and consensus
finality are separate. Bloch slot, height, and finality use the Bloch source
envelope. There is no cross-chain ownership inference or public AML score.
Bitcoin fee rates divide source-reported satoshis by rounded-up weight units;
the sequence flag signals replacement eligibility and does not predict whether
a transaction will be replaced. Bitcoin confirmation depth compares the
transaction block height with a separate best-chain head snapshot and can
change after a reorganization. Bitcoin transaction value accounting sums only
source-reported, nonnegative, safe-integer satoshi values. It reports exact
input and output totals, prior-output coverage, and the computed difference
against the source fee. Coinbase and incomplete inputs have no computed fee.
The proportional value chart appears only when complete totals exist; it does
not infer ownership or change outputs.
Ethereum block and identity-checked transaction views chart gas used against
the reported gas limit. The percentage is a presentation of integer gas units,
not a fee estimate. Ethereum execution gas fees multiply receipt
gas used by effective gas price. Blob fees multiply `blobGasUsed` by
`blobGasPrice` only when both receipt fields are present. The total fee is
unavailable when a blob transaction lacks either field. All calculations use
integer wei. Token
transfers come only from successful receipt logs emitted by fixed Ethereum
mainnet USDT and USDC contracts, with exact base-unit amounts and at most 64
events shown per transaction. Other contract calls and token approvals are
not represented as transfers.
The Bitcoin mempool chart draws all valid source histogram bins in descending
fee-rate order, capped at 512 bins. The threshold cards report the fee-bin
floor at cumulative 1M, 3M and 6M virtual bytes when the source backlog is
large enough. These are backlog observations, not confirmation predictions or
fee recommendations. The recent list is the source's last ten observed
mempool entries, not a complete network-wide transaction stream.
Overview block charts use the ten recent Bitcoin blocks already returned by
Esplora. Ethereum's optional `eth_feeHistory` response is limited to 12 blocks,
validated before rendering, and kept separate from the overview head snapshot.
The two Ethereum charts show gas-used ratio and exact-base-fee observations;
bars open their source block. Bar heights for transaction count, Bitcoin block
size and Ethereum base fee scale to the maximum in each displayed sample.
No series extrapolates past its returned range.
The Bloch overview draws the current slot within its reported epoch and shows
the source head's finalized, justified, and current epoch markers. These fields
come from one network-head response; the indexer remains a separate snapshot.
The additional validator, stake, mempool, and wall-slot metrics are reported
node observations. Slot positions are not a count of produced blocks, and the
panel does not claim a network-wide peer count.
Ethereum receipt state distinguishes pending, missing, unavailable and a block
identity mismatch. Execution fields, token events, confirmation depth and the
relation to the finalized height are shown only after the receipt transaction
hash, block hash and block number match the transaction response. The latest
and finalized heights remain separate source-reported snapshots. Their height
comparison does not independently verify canonical consensus finality.
Bloch transaction depth is calculated from the receipt's own indexed height.
The finalized height comes from a separate indexer health call. The explorer
labels whether the transaction receipt and health used the same chain tip,
height and slot; a separate-snapshot comparison is not presented as a
transaction-specific finality proof.

## Dedicated Graphus nodes

The `bloch-dex` Bitcoin Core node and `bloch-bridge` Erigon/Caplin node are
private state sources. Their loopback RPC listeners remain private. At the
2026-09-24 inspection, Bitcoin Core was still in initial block download at
height 440,291 (2016-11-24, verification progress about 12.25%). Erigon was
downloading snapshots at about 17% (352 GB of approximately 2 TB). Neither
could serve a current mainnet explorer. Bloch Space currently uses the same
bounded public-source adapters as Graphus. Switching to the dedicated nodes
requires validated tip sync, a read-only authenticated gateway with budgets,
reorg/finality monitoring, and the source comparison gate. Do not publish a
global BTC/ETH holder ranking from incomplete node state.

## Verification and deployment

Run `node --test tests/test_space_explorer.mjs` for source-boundary tests.
`python3 scripts/live_space_smoke.py` checks overview, block, transaction,
and address responses on each network against a local `wrangler pages dev .`
instance started from `space/` with `wrangler pages dev public`. The Pages
project uses `space/wrangler.toml` and deploys `space/public/`. The Ethereum RPC setting is public and
replaceable; do not put credentials in the tracked configuration.

Sources: [Blockstream Esplora API](https://github.com/blockstream/esplora/blob/master/API.md),
[Ethereum JSON-RPC](https://ethereum.org/developers/docs/apis/json-rpc/),
[Ethereum `eth_feeHistory` specification](https://ethereum.github.io/execution-apis/api/methods/eth_feeHistory/),
and the Bloch Explorer public `/api/v1` and `/indexer` APIs.
