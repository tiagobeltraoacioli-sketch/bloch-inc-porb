# Oculum 64-point balance map

Oculum supports BTC, ETH, USDT (Ethereum ERC-20), USDC (Ethereum ERC-20),
and BLCH. One point is one public network identifier, never a person or an
inferred wallet owner. Amounts are exact source-reported base units. Point size
and glow use a logarithmic scale within the selected asset. No location or AML
score is displayed.

## Bloch indexed scripts

The public Bloch historical indexer exposes `/indexer/holders?limit=64`. It
sorts positive script-hash balances in its indexed canonical state and reports
the number of positive script hashes, indexed total satoshis, block height,
slot, and block ID. Graphus fetches this list and `/indexer/health`, requires
matching anchors and zero reported lag, checks rank order and unique scripts,
and reconciles the sum with the indexed total when all positive scripts fit in
the list. A moving or malformed source fails closed.

The UI identifies this as a **source-reported indexed-script ranking**. It
does not establish beneficial ownership, combine scripts controlled by the same
person, or independently replay the indexer's state. The reported chain tip
can change during a reorganization. A manual Bloch script lookup returns to a
queried sample, so snapshots at different anchors are never presented as one
indexed ranking.

## Bitcoin and Ethereum queries

BTC, ETH, USDT, and USDC currently sort at most 64 identifiers queried in the
browser session. This is not a network-wide top 64. The
[Blockstream Esplora API](https://github.com/Blockstream/esplora/blob/master/API.md)
provides per-address Bitcoin aggregates, but no global balance ranking. The
[Ethereum JSON-RPC API](https://ethereum.org/developers/docs/apis/json-rpc/)
supports balance and log reads for specified accounts or filters, not a
complete public holder list. Ethereum token balances are contract specific.

The private holder-candidate index can rank saved successful lookups. BTC and
BLCH samples can combine retrieval times. Ethereum candidates can be compared
at a common source-reported finalized block hash. The private index is not
connected to the public Pages site and does not claim complete network
discovery.

## Own-node index work

Dedicated Bitcoin Core and Erigon mainnet nodes started initial sync on
2026-09-24 UTC; see `docs/infrastructure.md`. Until Bitcoin Core completes
initial block download, its private UTXO snapshot job cannot generate the
source-wide output-script ranking. The job uses the official SQLite snapshot
converter, checks the chain anchor and conversion completeness, and ranks exact
output scripts. Address display is limited to scripts for which Bitcoin Core
defines an address. It does not infer one owner across multiple scripts.

Erigon archive synchronization is in progress. A private resumable `Transfer`
candidate scanner is provisioned for USDT and USDC. Its event participants do
not by themselves establish every current token holder; same-block
`balanceOf` reads and coverage review are required. A complete native ETH
account-state enumeration is also needed for a source-wide ETH ranking.
