# Private Bitcoin block pilot

`service.bitcoin_pilot` reads one Bitcoin mainnet block through the [Blockstream Esplora HTTP API](https://github.com/Blockstream/esplora/blob/master/API.md). The pilot is bounded to **one block and at most five transactions**. It uses `GET /blocks/tip/height`, `GET /block-height/:height`, `GET /block/:hash`, `GET /block/:hash/header`, `GET /block/:hash/status`, `GET /block/:hash/txid/:index`, `GET /tx/:txid`, and `GET /tx/:txid/merkle-proof`, as documented by Esplora. Each source response is capped at 1 MB. The default block is six source-reported confirmations below the observed tip; the source tip and best-chain status are checked again before the sample is accepted.

Run only in the approved private data environment:

```sh
python3 -m service.bitcoin_pilot \
  --min-confirmations 6 --tx-limit 5 \
  --output /var/lib/bi-porb/private/bitcoin/bitcoin-block-pilot.json
```

The output directory is mode `0700`; the atomically replaced JSON artifact is mode `0600`. Standard output contains counts, the source-reported confirmation depth, and an artifact SHA-256 digest, but no transaction or address identifiers. The private artifact contains sampled transaction IDs, every sampled output's exact satoshi value and script, optional source-reported address, and input outpoint references. It includes zero-value outputs instead of silently dropping them. An output's unspent status is explicitly unknown because this pilot does not query outspends.

Schema v2 pins a block by height and hash, computes the double-SHA-256 hash of its 80-byte header, compares the header's Merkle root with block metadata, and recomputes every sampled transaction's Merkle branch against that header root. The private ledger inspector repeats those calculations from the stored artifact. The pilot also checks each transaction's ID against the block-index endpoint, its confirmed status against the selected block, and that the block hash at the selected height is unchanged at completion. Older schema v1 artifacts remain readable but are explicitly marked as lacking local header and inclusion checks.

These calculations verify internal consistency of data returned by **one public API**. They do not independently establish the header's consensus validity, proof of work, best-chain selection, or agreement with another node. The recorded confirmation count is source-reported and probabilistic, not deterministic finality. A later reorganization can invalidate the sampled block; the artifact is a snapshot, not a continuously reconciled feed.

An input points to a prior transaction output. It does not prove which person or wallet controlled that output, nor establish a single sender. This pilot does not infer addresses for input owners, cluster wallets, query transaction history, provide live chain coverage, compute AML scores, or publish identifiers. Before any production use, independently reconcile blocks and transaction inclusion, implement reorganization replay and source-gap detection, and review storage retention and data rights.
