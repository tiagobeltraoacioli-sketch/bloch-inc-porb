# Private Ethereum second-source reconciliation

`service.ethereum_reconcile` compares one existing [bounded Ethereum pilot](ethereum-private-pilot.md) with a second Ethereum mainnet RPC hostname. The default second operator is [dRPC's public Ethereum endpoint](https://drpc.org/docs/ethereum-api); the pilot's default source is PublicNode. The [Ethereum JSON-RPC reference](https://ethereum.org/developers/docs/apis/json-rpc/) defines the block, transaction, receipt, and `finalized` methods used here.

The reconciler first verifies the pilot's digest and aggregate schema. It then requires chain ID 1, a second source reporting a finalized height at or beyond the sampled height, the same block hash and transaction count at that height and by hash, the same sampled transaction hashes at their first block positions, and each sampled transaction and receipt's block, height, position, and receipt status. It validates the placement of every secondary receipt log and re-normalizes direct ETH and allowlisted USDT/USDC transfers, requiring exact agreement with the pilot's normalized movements. It checks the finalized head and selected block again after the sample. A mismatch fails closed. This is a comparison of **source-reported** finality, not an independent consensus proof. Different hostnames do not establish independent node operation or independent upstream providers.

The run is capped at ten sampled transactions, 26 RPC requests, and 1 MB per response (26 MB maximum response payload). Pilot input files are capped at 2 MB each. The public RPC may impose stricter rate limits, lag behind the first provider's finalized head, or become unavailable. In those cases the command fails without writing an agreement report; retry only after the second provider has independently finalized the sampled height. To select a second RPC, set `PORB_ETH_SECONDARY_RPC` to a distinct HTTPS endpoint; do not use credential-bearing URLs.

Run only on the private data host:

```sh
cd /opt/bi-porb
sudo -u porb python3 -m service.ethereum_reconcile \
  --pilot-dir /var/lib/bi-porb/private/ethereum-pilot-v3 \
  --output /var/lib/bi-porb/private/ethereum-pilot-v3/ethereum-second-source.json
```

The report is atomically written as a `0600` file in a `0700` directory. It contains source hostnames, aggregate flags and counts, pilot file digests, and request bounds. It contains no transaction hash, block hash, wallet address, or score. Standard output contains only the report type, sample count, agreement flag, and report digest. The [data-quality ledger](data-quality.md) may bind it to the exact pilot digest and manifest within 24 hours; this does not change `production_ready` or public source status.

The pilot does not retain complete transaction and receipt payloads. This comparison establishes equality only for the normalized direct ETH and allowlisted USDT/USDC movements in the sampled transactions. It cannot establish equality of unrelated receipt fields or logs, internal calls, arbitrary token events, or complete block execution. A complete replay requires a new versioned pilot with bounded raw payload digests or separately verified execution data. Production validation additionally requires an independently governed node or consensus verification, broader coverage, reorg replay, gap detection, provider rights, and retention review.
