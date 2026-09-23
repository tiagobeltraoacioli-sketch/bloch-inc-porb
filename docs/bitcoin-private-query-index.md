# Private Bitcoin pilot query index

`service.bitcoin_query_index` builds a local SQLite index from **one schema-v2 Bitcoin pilot artifact**. It calls the private pilot inspector first, which rechecks the stored block header and sampled transaction Merkle branches. It then pins the validated artifact by SHA-256 before indexing. The index is atomically replaced, mode `0600`, under a mode `0700` directory. It exposes no HTTP service.

Build only in the approved private data environment:

```sh
python3 -m service.bitcoin_query_index build \
  --pilot /var/lib/bi-porb/private/bitcoin/bitcoin-block-pilot-v2.json \
  --index /var/lib/bi-porb/private/bitcoin/bitcoin-query.sqlite
```

The index stores each sampled output's exact transaction ID, output position, satoshi value, script, optional **source-reported** address, and SHA-256 digest of the script bytes. It also stores each sampled input's prior outpoint reference with its position in the sampled transaction. A coinbase input has no prior outpoint row. The source artifact is limited to 8 MB and one block of at most five transactions; query pages are limited to 100 observations.

```sh
python3 -m service.bitcoin_query_index address \
  --index /var/lib/bi-porb/private/bitcoin/bitcoin-query.sqlite \
  --address 'bc1...' --limit 50

python3 -m service.bitcoin_query_index script \
  --index /var/lib/bi-porb/private/bitcoin/bitcoin-query.sqlite \
  --script-sha256 '<64 hex characters>' --limit 50

python3 -m service.bitcoin_query_index transaction \
  --index /var/lib/bi-porb/private/bitcoin/bitcoin-query.sqlite \
  --txid '<64 hex characters>' --limit 50
```

The `transaction` query returns output observations and input outpoint references belonging to the **sampled transaction**. The address and script queries return only sampled outputs. Their `next_cursor` supports keyset pagination; a null cursor means the result ended within this sample. No query means global transaction history, UTXO status, ownership, a single sender, beneficial ownership, or an AML conclusion. A prior outpoint may be outside the sampled block. This index does not query its source transaction or assign its address to the sampled input. Header and Merkle checks establish internal consistency with one API's responses; they do not independently validate Bitcoin consensus or current best-chain status.

Query output contains transaction identifiers and scripts. Keep it private, enforce operator access at the host boundary, and avoid copying the index or responses into the public Graphus dashboard. Standard output from `build` contains counts and a digest only; query commands intentionally print identifiers for local authorized research.
