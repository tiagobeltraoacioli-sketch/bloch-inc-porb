# Private Bitcoin transaction graph pilot

`service.bitcoin_graph_pilot` derives aggregate transaction-level graph measures from one bounded, schema-v2 or schema-v3 Bitcoin block artifact. It first repeats the artifact's digest, header hash, and sampled transaction Merkle-branch checks; schema v3 also verifies raw transaction bodies against txids and stored inputs/outputs. A directed within-sample link exists only when an observed input names an output from an earlier sampled transaction in the same block. Duplicate spent outpoints and impossible within-block ordering fail closed. Weak components ignore direction.

Run it in the private data environment:

```sh
python3 -m service.bitcoin_graph_pilot \
  --pilot /var/lib/bi-porb/private/bitcoin/bitcoin-block-pilot-v3.json \
  --output /var/lib/bi-porb/private/bitcoin/bitcoin-graph-summary-v3.json
```

The atomically written output is mode `0600`. It contains counts, value and degree distributions, script reuse, sample provenance, and explicit verification limits, but no transaction IDs, scripts, addresses, or AML scores. Standard output includes aggregate counts only.

The existing five-transaction pilot has eight outputs and four input outpoint references. None of those four references resolves to a creation inside the five sampled transactions, so it has zero within-sample links and five isolated transaction components. Its eight outputs include one zero-value output. This is a one-block, nonrepresentative sample; the four unmatched references mean **unknown outside the sample**, not absent or unspent on the chain.

The schema-v3 artifact locally verifies each raw transaction body's txid, input outpoints, output satoshi values, and output scripts. Source-reported output addresses remain unchecked, and the source's best-chain and confirmation claims have not been independently validated by a full node. A graph link, if present, would identify an outpoint reference, not a person, wallet owner, or proven value flow through a transaction. This module neither ingests Bitcoin history nor publishes wallet data. Independent consensus validation, reorganization handling, and materially broader historical sampling remain required before operational use. Schema-v2 reports explicitly mark body verification false.
