# Private Bloch backfill checkpoint

`service.bloch_backfill` can resume a **partial, bounded** historical-indexer sample from its private manifest and JSONL observations. A new collection writes a `checkpoint_version: 1` manifest containing the source cursor history, a SHA-256 fingerprint for each finalized transaction identity, the original reported finalized height, snapshot height and slot, page limits, and the digest of the observations. The fingerprints support duplicate checks without adding raw transaction identifiers to the manifest. The observation file itself remains private and contains on-chain identifiers.

```sh
cd /opt/bi-porb
sudo -u porb python3 -m service.bloch_backfill \
  --pages 1 --page-size 5 \
  --output-dir /var/lib/bi-porb/private/bloch-resume-pilot-1
sudo -u porb python3 -m service.bloch_backfill \
  --pages 2 --page-size 5 \
  --resume-dir /var/lib/bi-porb/private/bloch-resume-pilot-1 \
  --output-dir /var/lib/bi-porb/private/bloch-resume-pilot-2
```

`--pages` is the **total** target page count, capped at 20. The resume directory must contain an incomplete version-1 checkpoint; completed samples and older manifests without checkpoint metadata cannot be resumed. The output directory must differ from the input directory, so a failed continuation leaves the previous checkpoint intact. The loader verifies the observation digest, counts, cursor format and uniqueness, transaction fingerprint count, and the sample's existing aggregate quality checks. A continuation rejects a changed source snapshot, repeated cursor or transaction, and a decrease in the source-reported finalized height. It keeps the first run's finalized-height threshold for every page; a later source health increase does not expand the original sample's finality boundary. Only aggregate counts are printed to standard output. Both artifacts are stored under private `0700` directories with `0600` files.

On the data host, a one-page pilot with five finalized transactions was resumed to two pages and ten finalized transactions. The resumed sample has 17 created outputs, 763 spent-outpoint observations, a passing within-sample quality gate, and remains incomplete (`source_complete=false`). This is a small operational checkpoint exercise, **not** continuous ingestion or chain coverage.

Snapshot height and slot are source metadata, not an independently verified block root. The historical indexer may omit or change history without exposing that change through a later page's metadata. This checkpoint does not detect every reorganization, prove all pages of history were served, reconcile against a validating node, or assign ownership or AML risk. Production ingestion still requires a canonical block/root anchor, gap detection, rollback and replay, source reconciliation, and retention controls.
