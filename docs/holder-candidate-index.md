# Private holder-candidate index

`service.holder_candidate_index` stores source-reported balances from saved Graphus `GET /api/chain/wallet` responses. It is a bounded, local research index for **addresses and Bloch script hashes**, not people or multi-address wallets. It does not crawl the chains, discover all identifiers, calculate AML scores, or serve a public API.

Save one successful JSON response per line in a local JSONL file and run:

```sh
python3 -m service.holder_candidate_index build --input-jsonl /private/data/graphus-lookups.jsonl --index /private/data/holders.sqlite
python3 -m service.holder_candidate_index top --index /private/data/holders.sqlite --asset BTC --limit 25
python3 -m service.holder_candidate_index top --index /private/data/holders.sqlite --asset USDC --block-hash 0x<64-hex-block-hash> --limit 25
python3 -m service.holder_candidate_index top --index /private/data/holders.sqlite --asset BLCH --limit 64
```

The builder accepts at most 10,000 successful lookup responses and 16 MB per build. It validates the network, asset, source, exact decimal base-unit amount, and expected balance scope, then atomically replaces a mode-0600 SQLite file in a mode-0700 directory. Only the queried address or Bloch script hash is imported. It ignores transaction neighbors, names, annotations, and response fields outside the allowlist. For a repeated BTC address or Bloch script hash, the newest retrieval wins. For Ethereum, observations are keyed by asset, address, and source-reported finalized block hash. Ranking uses exact decimal-string order, including values larger than SQLite integers.

BTC address aggregates and BLCH script-hash balances are queried at different times and have no shared UTXO snapshot. Their ranking is therefore a **mixed-time sample**. ETH, USDT, and USDC queries require a supplied block hash to keep candidates at one source-reported finalized block; those state reads are still not independently verified. Missing identifiers are not zero-balance identifiers. All output says `network_wide_discovery_complete=false` and `chain_history_complete=false`. A zero result means no imported candidate at that anchor, not no holders.

For a real chain-wide Bitcoin or Bloch ranking, Graphus would need a complete, validated UTXO set at one tip, script/address decoding, reorg handling, and reconciliation. For ERC-20 ranking, it would need complete token-specific holder discovery from deployment or a trustworthy state index, same-block `balanceOf` reads, reconciliation, and upgrade/mint/burn handling. ETH native balances additionally require full account-state enumeration, which standard JSON-RPC does not offer. The candidate index is an ingestion and provenance step toward that infrastructure, not a substitute for it.
