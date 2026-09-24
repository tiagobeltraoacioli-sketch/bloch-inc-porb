# Oculum 64-point holder map

Oculum lets a visitor select BTC, ETH, USDT (Ethereum ERC-20), USDC (Ethereum ERC-20), or BLCH and compare up to 64 public identifiers for that asset. A visitor can add one identifier or paste up to 16 at a time. The map and exact-value list sort the **queried sample** by source-reported held amount. Point size and glow use a logarithmic scale within the selected asset. No person, owner, location, AML score, or cross-asset valuation is inferred.

The page cannot presently say these are the network's 64 largest holders. The [Blockstream Esplora API](https://github.com/Blockstream/esplora/blob/master/API.md) provides per-address Bitcoin aggregates, but no network-wide address balance ranking. The [Ethereum JSON-RPC API](https://ethereum.org/developers/docs/apis/json-rpc/) provides balance and log reads for specified accounts or filters, not a complete list of state holders. Etherscan documents a [token holder list](https://docs.etherscan.io/introduction), but a third-party list would need access rights, source-version and coverage review, then same-anchor balance reconciliation before a network-wide claim. Bloch's public archival lookup accepts a specified script hash, not all script hashes.

The private holder-candidate index can rank saved successful lookups for all five assets, up to 64 results per request. BTC and BLCH samples combine different retrieval times. Ethereum candidates can be compared only at the same source-reported finalized block hash. The private index is not connected to the public Pages site and never claims complete network discovery.

A network-wide top-64 release needs complete candidate discovery at a declared chain snapshot, exact same-snapshot balances, reorg handling, source reconciliation, and an explicit coverage ledger. For BTC and BLCH this means an indexed UTXO set and a defined script/address grouping rule. For ETH it means account-state enumeration. For each ERC-20 it means contract-specific holder discovery and same-block `balanceOf` reads. Even then the ranked objects are addresses or script hashes, not beneficial owners or multi-address wallets.

## Own-node index work

Dedicated Bitcoin Core and Erigon mainnet nodes started initial sync on
2026-09-24 UTC; see `docs/infrastructure.md`. This changes the available data
source, but does not yet change the public map's sample-only coverage claim.
`service/bitcoin_utxo_ranking.py` can rank all confirmed Bitcoin output scripts
from a complete Bitcoin Core UTXO snapshot converted by the official SQLite
utility. It rejects an incomplete node, a mismatched snapshot anchor, and a
partial conversion. The rank unit is an exact output script, with an address
only where Bitcoin Core defines one; it is not a ranking of persons or all
addresses controlled by a wallet. The other four assets still need complete
indexing and same-anchor balance validation before a global top-64 view.
