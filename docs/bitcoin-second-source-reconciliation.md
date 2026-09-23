# Private Bitcoin second-source reconciliation

`service.bitcoin_reconcile` compares one verified schema-v2 [bounded Bitcoin pilot](bitcoin-private-pilot.md) with the [mempool.space REST API](https://mempool.space/docs/api/rest), a second public operator. It checks that both sources report the same block hash at the sampled height, identical 80-byte header, best-chain status, sampled transaction IDs at their block positions, and valid Merkle branches against the same header root. The second tip, selected height, and best-chain status are checked again at completion. The comparison is capped at five transactions and each response at 1 MB.

Run it only on the private data host:

```sh
python3 -m service.bitcoin_reconcile \
  --pilot /var/lib/bi-porb/private/bitcoin/bitcoin-block-pilot-v2.json \
  --output /var/lib/bi-porb/private/bitcoin/bitcoin-second-source.json
```

The report is atomically written as a `0600` file in a `0700` directory. Standard output and the report contain only aggregate counts, source names, the digest of the private pilot, and verification flags; no transaction IDs, addresses, scripts, wallet references, or scores are exported. A mismatch or source error fails closed and produces no success report.

Pass the report alongside the exact pilot to `service.data_quality` with `--bitcoin-reconciliation`. The ledger verifies its pilot digest, source IDs, block height, sampled transaction count, confirmation depth, agreement flags, and timestamp. Reports older than 24 hours at ledger generation fail closed; rerun the comparison to refresh evidence. The ledger stores the report hash and aggregate source agreement only. `production_ready` remains false.

Agreement between two public operators improves source reconciliation for this **one bounded sample**. It does not prove their nodes are operationally independent, validate proof of work or consensus rules with a local full node, establish historical coverage, resolve Bitcoin input ownership, or provide AML conclusions. Production ingestion still needs a controlled node or independently governed source, reorganization replay, gap detection, retention review, and broader reconciliation.
