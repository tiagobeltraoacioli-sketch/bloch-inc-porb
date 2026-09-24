# Private Bloch transaction graph pilot

`service.bloch_graph_pilot` analyzes one bounded, private Bloch eUTXO sample on the data host. It verifies the sample digest and quality gate, then links a spent outpoint to its exact observed creation **only when both records are in that sample** and the amount, script hash, and slot order agree. The graph's nodes are observed transactions. Its edges are consistent, source-reported outpoint references; weak components ignore edge direction.

Run it on the data host with an existing private sample:

```sh
python3 -m service.bloch_graph_pilot \
  --sample-dir /var/lib/bi-porb/private/bloch-pilot-30 \
  --output /var/lib/bi-porb/private/bloch-pilot-30/graph-summary.json
```

The output file is mode `0600` and contains aggregates and the sample digest, without transaction IDs or script hashes. The command prints a short aggregate summary. Keep the raw sample and query index inside the private data environment.

## Result from the 495-transaction pilot

The source-reported finalized sample has 495 sampled transactions, 494 transaction IDs with retained observations, 878 created outputs, and 67,760 spent-outpoint references. It yields 407 consistent within-sample links between 407 distinct transaction pairs, involving 435 transactions. There are 104 weak components among observed transactions; the largest contains 95 transactions and 59 are isolated. Of the input references, 67,353 do not have their creation in this sample. The 878 output observations use 46 distinct script hashes, 32 of which occur more than once. The report also contains exact base-unit output value totals and percentiles, and input/output count percentiles.

These are descriptive properties of a bounded, nonrepresentative sample. A missing creation is unknown rather than unspent; the link count is not a chain coverage rate. Shared scripts and connected transactions do not establish a common wallet owner, a person, or value continuity through a transaction. The indexer's finality claim has not been independently verified. No AML score, entity cluster, or public wallet result is generated. Production readiness and complete Bloch history remain unestablished.
