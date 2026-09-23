# Private Bloch sample query index

`service.bloch_query_index` builds a local SQLite index over one bounded, private Bloch JSONL sample. It verifies the exact sample byte digest and manifest counts before replacing an existing index. It preserves the source ID, source retrieval time, indexer snapshot height/slot, source-reported finalized height, sample digest, and source line number. A failed build leaves the prior index intact. The database directory is mode `0700` and the database file is mode `0600`.

Build on the **data host only**, using the sample directory already held there:

```sh
python3 -m service.bloch_query_index build \
  --sample-dir /var/lib/bi-porb/private/bloch \
  --index /var/lib/bi-porb/private/bloch/bloch-query.sqlite
```

Query a 64-hex script hash or a precise transaction outpoint:

```sh
python3 -m service.bloch_query_index script \
  --index /var/lib/bi-porb/private/bloch/bloch-query.sqlite \
  --hash <64-hex-script-hash> --limit 50

python3 -m service.bloch_query_index outpoint \
  --index /var/lib/bi-porb/private/bloch/bloch-query.sqlite \
  --txid <64-hex-txid> --vout 0 --limit 50
```

When `next_cursor` is non-null, pass its integer value with `--cursor` for the next page. Pages are capped at 100 observations and use a stable internal row ID. Rebuilds replace the whole database; restart pagination after a rebuild. CLI query output contains transaction and script identifiers, so keep terminals, logs, and exported results inside the approved private data environment. This module provides no public API and does not move raw identifiers to the graph/ML host.

Each `created_output_observation` means a sample transaction created a particular outpoint with a script hash and exact base-unit amount. Each `spent_outpoint_observation` means a sample transaction referenced a prior outpoint. A script-hash query returns both observation types when they carry that hash; an outpoint query returns any observed creation and spends of that precise outpoint. A matching outpoint is a **within-sample candidate link**. Compare script hash and amount and reconcile with independent chain data before treating it as a confirmed source fact. Neither observation identifies a natural person, a wallet owner, or a single sender. The source's finality claim is recorded, not independently verified.

An outpoint query also returns `outpoint_evidence`, calculated across **all** observations for that exact outpoint even when the displayed page is limited. It reports creation and spend observation counts, the creation's source line, and one of: `outpoint_not_observed`, `creation_only_spend_not_in_sample`, `spend_only_creation_not_in_sample`, `consistent_creation_and_spend_observations`, `multiple_spend_observations`, or `conflicting_observations`. The conflict status counts script or amount mismatches and spends whose slot precedes the observed creation slot. A missing creation or spend means only that it was absent from this bounded sample; it does not establish an unspent output or a nonexistent transaction. Even the consistent status describes source observations, **not** independent chain validation or owner attribution. The `sender_ownership_inferred` and `source_finality_independently_verified` fields stay false.

The collector's page limit bounds the sample, but it does not establish a complete chain history. `source_complete` only reports whether this bounded cursor reached its end. Missing rows are **unknown**, not zero activity. The index does not compute AML scores, real wallet clusters, chain coverage, or live transaction feeds.
