# Bloch Space explorer

`space/` is the standalone Cloudflare Pages project for the Bitcoin, Ethereum,
and Bloch explorer. It uses the Bloch Inc identity and keeps every result tied
to its network, source, retrieval time, and coverage boundary. Graphus chain
adapters are imported directly for public address and script lookups.

## Live read surfaces

| Network | Overview | Block and transaction | Public reference |
| --- | --- | --- | --- |
| Bitcoin | Blockstream Esplora best-chain blocks, mempool, fee estimates | Esplora block, transaction, outspend facts, source-head confirmation depth, virtual size, fee rate and sequence replacement signal | Graphus Esplora address aggregate and bounded confirmed transaction graph |
| Ethereum | Configured mainnet JSON-RPC latest/finalized blocks, gas price | JSON-RPC block and receipt; exact execution gas fee, allowlisted USDT/USDC Transfer events and separate finalized checkpoint | Graphus ETH/USDT/USDC finalized-block balance; bounded ERC-20 Transfer logs |
| Bloch | Bloch Explorer network head and verified historical indexer | Bloch Explorer slot/block and indexer transaction receipts with indexed depth and finalized-height comparison | Graphus 64-hex script-hash lookup, bounded history and evidence edges |

The API is read-only and validates network, record type, identifier, asset, and
parameter count before a source call. Responses are capped at 3 MiB, have an
8.5-second source timeout, and are not stored in a shared cache. The Pages
function applies a short-lived per-isolate request budget. This budget is
best-effort across isolates; durable quotas require a shared governor.

`GET /api/overview?network=bitcoin|ethereum|bloch`

`GET /api/block?network=...&query=<height, slot, or block hash>&offset=<optional transaction offset>`

`GET /api/tx?network=...&query=<transaction hash>`

`GET /api/address?network=...&asset=BTC|ETH|USDT|USDC|BLCH&query=<address or Bloch script hash>`

The browser pages block transaction IDs in groups of 32, bounds graph edges,
and shows up to 32 UTXOs for Bitcoin and Bloch identifiers when those separate
source queries respond. It retains
exact base-unit strings in source responses; decimal rendering is a view only.
Observed graph points can open their source address, Bloch script reference, or
transaction with a pointer or keyboard. A point is interactive only when the
source supplied a valid identifier for that network.
An address, script hash, or UTXO reference is not a person or a complete wallet.
Bitcoin confirmation is probabilistic. Ethereum receipt success and consensus
finality are separate. Bloch slot, height, and finality use the Bloch source
envelope. There is no cross-chain ownership inference or public AML score.
Bitcoin fee rates divide source-reported satoshis by rounded-up weight units;
the sequence flag signals replacement eligibility and does not predict whether
a transaction will be replaced. Bitcoin confirmation depth compares the
transaction block height with a separate best-chain head snapshot and can
change after a reorganization. Ethereum execution gas fees multiply receipt
gas used by effective gas price; optional blob fees are not included. Token
transfers come only from successful receipt logs emitted by fixed Ethereum
mainnet USDT and USDC contracts, with exact base-unit amounts and at most 64
events shown per transaction. Other contract calls and token approvals are
not represented as transfers.
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
and the Bloch Explorer public `/api/v1` and `/indexer` APIs.
