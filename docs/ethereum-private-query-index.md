# Private Ethereum pilot query index

`service.ethereum_query_index` builds a local SQLite index from the digest-linked, bounded [Ethereum finalized-block pilot](ethereum-private-pilot.md). Build first runs the aggregate evidence validator, checks the raw bytes again, verifies the ten-transaction limit and native event indexes, and atomically replaces a 0600 index in a 0700 directory. A failed validation leaves an existing index in place.

The index contains only normalized, successful direct ETH movements and allowlisted USDT/USDC ERC-20 `Transfer` events already present in the pilot. It can search a protocol address by **one asset** and direction, or a transaction hash, with a maximum page size of 100. Amounts are returned as exact decimal strings in base units. Each result includes the event key, source line, block reference, and source-reported finalized-block provenance. An account's presence in an event does not identify its owner; a transaction `from` address is a protocol sender, not a person. The source-reported finality is not independently verified, and this tiny first-hashes sample says nothing about chain coverage or AML risk.

Run only on the private data host. Query output includes addresses and transaction hashes, so it must stay in a restricted shell or file:

```sh
cd /opt/bi-porb
sudo -u porb python3 -m service.ethereum_query_index build \
  --sample-dir /var/lib/bi-porb/private/ethereum-pilot \
  --index /var/lib/bi-porb/private/ethereum-pilot/query.sqlite
sudo -u porb python3 -m service.ethereum_query_index address \
  --index /var/lib/bi-porb/private/ethereum-pilot/query.sqlite \
  --address 0x0000000000000000000000000000000000000000 \
  --asset usdc --direction incoming --limit 25
```

The example address is a placeholder. The module has no HTTP listener, public API, wallet score, identity lookup, or continuous ingestion. Rebuild after each new validated pilot artifact; never interpret a zero-result query as absence from Ethereum history.
