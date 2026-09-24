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
zero reported lag and a health head within 16 slots of the ranking, checks rank order and unique scripts,
and reconciles the sum with the indexed total when all positive scripts fit in
the list. A mismatched same-height block or malformed source fails closed. A
newer or earlier nearby health head is identified separately while the ranking retains its own
reported block anchor.

The UI identifies this as a **source-reported indexed-script ranking**. It
does not establish beneficial ownership, combine scripts controlled by the same
person, or independently replay the indexer's state. The reported chain tip
can change during a reorganization. A manual Bloch script lookup returns to a
queried sample, so snapshots at different anchors are never presented as one
indexed ranking.
Each selected identifier links to the source-aware Constellation. The link
selects the same asset and loads its bounded live address or script-hash query
automatically. The Constellation's default generated-wallet view remains
separate from this linked public-chain observation.
For source-reported BTC and BLCH responses, returned transaction squares in
the Constellation can be inspected by mouse, source-record button, or keyboard.
The detail lists the transaction identifier, source block, observation scope,
and up to 24 input/output references returned for that transaction. It does
not infer sender identity or input ownership.

The source-aware Constellation also calculates bounded observation metrics in
exact base units. BTC and BLCH input references and created outputs have
separate counts and sums; they are never added into a claimed transaction
volume. ERC-20 incoming, outgoing, and self `Transfer` logs are counted
separately within the reported block window. Native ETH remains a balance-only
view until a transaction index is connected. Every panel states its source,
block range, and coverage limit.

In a source-reported USDT or USDC query, each returned `Transfer` log in the
source-record list can be selected. Its detail shows the exact amount, direction,
transaction hash, block hash and height, transaction and log indexes, contract,
both public addresses, source, and observation scope. The matching constellation
arrow is highlighted. The scrollable list contains all logs returned by the
bounded response; it is not a complete token history or an ownership inference.
The bounded metrics panel also shows active blocks, the busiest returned block,
and up to eight block-range bars based on returned logs. Selecting a bar filters
the source-record list, including empty ranges; it does not change the full
constellation or extend the query window. Counts and amounts use exact integer
base units, and no AML classification is inferred.

Token balance and log calls are separate. The Constellation displays each
source-reported finalized head, block hash, and retrieval time. It accepts the
log response only if the token contract matches the balance contract. A
same-height hash conflict is rejected; differing valid heads remain separate
and their amounts must not be reconciled as one snapshot. Ethereum address case
is normalized when matching a queried address to returned log nodes.

The source-aware canvas plots at most 36 other points from a bounded response
and states the visible and returned counts. For USDT and USDC, it chooses points
by the number of returned logs; selecting a log brings its address into view
even when it was previously outside the canvas cap. For BTC and BLCH,
transaction records take precedence over other points. This display selection
is not a risk ranking. The scrollable source-record list keeps every returned
token log and source node; the JSON export keeps all returned nodes, edges, and
token logs, including those omitted from the canvas.

For a queried USDT or USDC address, the metrics panel also contains a
scrollable ledger of every other address seen in returned `Transfer` logs. It
orders them by observed log count and shows separate exact incoming and
outgoing sums relative to the queried address, counts, and first and last observed blocks. Selecting an address
filters the log list and brings its point and returned links into view. This
is a bounded address-level observation, not a person, owner, balance, or AML
score. The same peer breakdown is included in the JSON export.

Any source-reported Constellation query can be downloaded as a versioned
`graphus_public_chain_observation` JSON file. The browser builds it from the
currently loaded bounded response. It includes the queried identifier, exact
balance, source metadata, returned nodes and edges, calculated metrics, and
token logs and anchor comparison when those were successfully loaded. Only
explicit public-chain fields are copied; no private score, person label, or
unrecognized source field is exported. A balance-only download remains marked
as balance-only if a separate activity call is pending or unavailable.

Selecting a Bloch indexed point fetches up to 12 separate script-history
events from the public archival lookup. The history observation does not change
the ranked snapshot balance or its block anchor. Created outputs and spent
outpoint references are displayed as transaction edges, not ownership claims.

## Bitcoin and Ethereum queries

BTC, ETH, USDT, and USDC currently sort at most 64 identifiers queried in the
browser session. This is not a network-wide top 64. The
[Blockstream Esplora API](https://github.com/Blockstream/esplora/blob/master/API.md)
provides per-address Bitcoin aggregates, but no global balance ranking. The
[Ethereum JSON-RPC API](https://ethereum.org/developers/docs/apis/json-rpc/)
supports balance and log reads for specified accounts or filters, not a
complete public holder list. Ethereum token balances are contract specific.
For a queried Bitcoin address, Oculum displays the first bounded page of
source-reported confirmed transaction input/output edges separately from the
address aggregate. An input prevout is a transaction reference, not proof that
the address owner initiated or controlled every input.

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
