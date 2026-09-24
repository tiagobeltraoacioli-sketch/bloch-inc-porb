# Bloch public script-hash lookup

Graphus can query a **Genesis-4 32-byte script hash** through the public Bloch explorer's archival read proxy. The route is `GET /api/chain/wallet?network=bloch&asset=BLCH&address=<64-hex-script-hash>`. It returns an exact decimal satoshi string, UTXO count, a prior head observation, source corroboration metadata, and up to twelve historical indexer events. The result is `source-reported`, not independently verified by Graphus.

The underlying explorer uses `/rpc` for `getchaininfo` and `getbalance`, then `/indexer/history/<hash>?limit=12` for bounded event evidence. The archival balance and head are separate moving-chain calls. The head's slot, height, finalized height, and state root describe the source just before the balance call; they are **not** an exact balance snapshot. The history page has its own indexed slot and may describe a different time. The API never computes held amount from a partial event sum.

An arbitrary 64-hex string can be a script hash, transaction ID, block ID, or typo. The Bloch `getbalance` method can return zero for any such string. To avoid presenting an invented zero, Graphus returns `422 indeterminate_bloch_script_hash` when the balance is zero and the bounded history query supplies no valid use evidence. A positive balance can still be shown if history is unavailable, with `balance_only_history_unavailable` coverage. Input must be a full script hash; Genesis-3 address conversion and native-key sibling handling are outside this route.

History edges are typed as observed created outputs or spent-outpoint references. They do not identify the spender, wallet owner, person, or beneficial owner. Every amount stays in exact decimal satoshis. The response omits AML scores, identity data, and nominal attribution. The endpoint is a bounded source read; it is not a chain-wide holder index.

The public [Bloch explorer implementation](https://github.com/tiagobeltraoacioli-sketch/bloch-explorer-indexer) documents the archival proxy, script-hash forms, and the zero-balance ambiguity. Graphus's source boundary and display states are documented in [real-data provenance](real-data-provenance.md).
