# Private Ethereum finalized-block pilot

`service.ethereum_pilot` reads one block tagged `finalized` from an Ethereum mainnet JSON-RPC source, selects at most ten transaction hashes, fetches each transaction and receipt, and normalizes successful direct ETH value transfers and allowlisted USDT/USDC ERC-20 `Transfer` logs. The [Ethereum JSON-RPC reference](https://ethereum.org/developers/docs/apis/json-rpc/) defines the block, transaction, receipt, log, and finality-tag fields used here. The pilot checks chain ID 1, unique block transaction hashes, each sampled transaction's position in the block, matching receipt position and status, and the placement and order of every receipt log, including logs from other contracts. It also checks token contract and `Transfer` encoding before normalization. Finality is **reported by one RPC source** and has not been independently reconciled with a local node.

The first private run selected five transaction hashes from one source-reported finalized block. It yielded two direct ETH movements, 13 USDT transfers, and 15 USDC transfers. Multiple token events can occur in one transaction, so 30 movements from five transactions is not a contradiction. These counts are from a deliberately biased, tiny sample and are **not network, block, token, or customer coverage**. Failed receipts yield no movement. Internal ETH calls, contract creation, mint/burn as wallet transfers, arbitrary tokens, valuation, and beneficial ownership are outside this pilot.

A second five-transaction run with stricter receipt and log placement checks yielded 4 direct ETH movements, 3 USDT events, and 24 USDC events in a separate private sample. The two samples may overlap and must not be added to imply unique transaction coverage.

To reconcile with a second RPC that reports a lower finalized head, `--block-number HEIGHT` selects an older block. The pilot first checks that `HEIGHT` does not exceed the primary source's reported finalized head, then fetches that exact height and records both the sampled block and the primary head height. The second provider must separately report finality at or beyond `HEIGHT`; the two hostnames still do not prove independent consensus validation.

A third private pilot selected five transactions from such a historical height. It produced two direct ETH movements and one USDT event; a separate dRPC comparison matched all three normalized movements. This is a source agreement for one biased sample, not history coverage.

Run only on the private data host:

```sh
cd /opt/bi-porb
sudo -u porb python3 -m service.ethereum_pilot \
  --limit 5 --output-dir /var/lib/bi-porb/private/ethereum-pilot
sudo -u porb python3 -m service.data_quality \
  --ethereum-pilot-dir /var/lib/bi-porb/private/ethereum-pilot \
  --bloch-sample-dir /var/lib/bi-porb/private/bloch-pilot-30 \
  --chain-health /var/lib/bi-porb/status/chain-health-status.json \
  --output /var/lib/bi-porb/private/data-evidence-ledger-v2.json
```

The pilot writes a digest-linked manifest and JSONL observations as 0600 files in a 0700 directory. The ledger rechecks the digest, counts, source, event keys, block identity, exact integer units, allowlisted assets, and successful sampled receipts; it exports only aggregates. A source endpoint's hostname is recorded without URL credentials or path. The current ledger marks all five initial assets as bounded private samples after the separate [Bitcoin block pilot](bitcoin-private-pilot.md). `production_ready` remains false.

Before broader Ethereum ingestion, add source-independent finalized-block reconciliation, canonical block/receipt replay, complete transaction and log counts, reorg handling, bounded checkpoints, provider rights and rate limits, storage/egress measurements, and a versioned token metadata registry. Never infer a person or AML conclusion from a transaction's `from` field.
