# Initial asset data evidence ledger

`service.data_quality` creates a private, aggregate ledger for BTC, ETH, USDT and USDC on Ethereum, and BLCH. It records what was actually observed by each source. Bitcoin has a bounded private [block pilot](bitcoin-private-pilot.md), and Ethereum has a bounded private [transaction and receipt pilot](ethereum-private-pilot.md). Height probes alone imply no transaction coverage. The bounded Bloch indexer samples are private research data, not a live feed or a representative chain history.

Generate a ledger on the data host after source jobs finish:

```sh
python3 -m service.data_quality \
  --bloch-sample-dir /var/lib/bi-porb/private/bloch \
  --bitcoin-pilot /var/lib/bi-porb/private/bitcoin/bitcoin-block-pilot.json \
  --ethereum-pilot-dir /var/lib/bi-porb/private/ethereum-pilot \
  --chain-health /var/lib/bi-porb/status/chain-health-status.json \
  --output /var/lib/bi-porb/private/data-evidence-ledger.json
```

The command requires each specified input to exist. It checks the Bloch sample digest, record counts, source consistency, observed transaction count, finalized input heights, exact nonnegative integer base units, outpoint/script identifiers, and sender-attribution flag. It reconciles consumed outpoints against created outputs **within the sample only**, counting mismatched values/scripts and duplicate spends for review. It also checks the Bitcoin pilot's block, sampled transaction and output structure, and the Ethereum pilot's digest, block, receipt, and event counts. It emits no transaction IDs, scripts, addresses, or raw records. A mismatch in the digest or record structure fails closed; an outpoint conflict sets `quality_gate: review_required`.

For every asset, the ledger includes base-unit semantics, source timestamp and measured age, source-reported finality evidence, lineage, known sample counts, unknown chain totals, and explicit gap/reorg/reconciliation states. Exact integer amounts are verified for the bounded Bitcoin, Bloch, and Ethereum samples; assets with height probes alone show `null` for that verification. An unknown coverage fraction stays `null`; a height probe never becomes an event count. The timestamp age is a measurement, not a freshness service-level guarantee. Token decimals and contract metadata need an independently versioned registry before display or valuation.

`pagination_exhausted` means only that this bounded indexer query reached its cursor end. `chain_history_complete`, `production_coverage_asserted`, and `production_ready` remain false. The sampled input height range is not a block coverage range; transactions without inputs may be absent from it.

Before any source may be marked production ready, implement independent node/indexer reconciliation, block and transaction completeness checks, source lag and outage monitoring, reorg replay, idempotent backfill, and asset-specific event counts. For Bitcoin, resolve inputs to previous outputs without inferring a person-level sender. For Ethereum tokens, count exact allowlisted contract logs and verify receipt status, chain ID, block hash and finality. Bloch output and spent-outpoint observations remain separate until their linkage is supported by the source.

## Bounded expansion on two 128 GB hosts

The data host holds source responses, raw observations, checkpoints, and private reconciliation reports. The graph/ML host receives only versioned, privacy-reduced aggregates that pass transfer review. The first bounded Bloch run produced about 13 MB for 400 finalized transactions and 24,857 observations. A separate pilot using 20 adaptive pages produced a 36,876,499-byte raw JSONL file with 495 finalized transactions and 68,638 observations in 52.51 seconds; seven responses exceeded the 2 MB cap and were retried at half the requested page size. These are two bounded samples, not independent chain coverage. The large input fan-in makes a simple bytes-per-transaction estimate unreliable. Compressed storage size, fetched network bytes, sustained throughput, and cross-chain rates remain unmeasured.

For each proposed adapter, run a small measured pilot and record bytes read from the source, bytes written before and after compression, transactions/events, elapsed time, request failures, retries, and outbound transfer. Derive per-source rates from those measurements. Store a checkpoint with source identity, chain/network, snapshot or block hash, finality marker, cursor/range, schema version, and output digest. Advance the checkpoint only after an atomic data write and reconciliation; on restart, re-read the overlap window and deduplicate by canonical event key. Hold disputed or reorganized ranges out of analytics until replay completes.

Set explicit **operator-configured** caps on request rate, bytes per run, disk free-space reserve, and outbound transfer before larger backfills. Record each run's actual usage against those caps. Retain raw source responses for a short reviewed period, canonical observations for the approved retention period, and aggregate reports separately; both durations remain unset pending legal/source-rights review. Rotate and delete by retention policy with an audit record, and encrypt private storage/backups. Do not move raw identifiers to the ML host by default.

The stated “65 TB bandwidth” has no confirmed time period, direction, billing scope, or host allocation. It cannot yet be treated as 65 TB per host or per month. Budget requests against the actual provider contract after those units are confirmed; source rate limits and license terms may be tighter than network capacity. The current bounded collector remains capped at 20 successful pages of at most 100 transactions and a 2 MB response limit per request. If a response exceeds that bound, the collector retries the same cursor with half the page size and records the retry count and actual page limits; it fails if even a one-transaction response exceeds the bound. No automatic full-history ingestion is enabled by this document.
