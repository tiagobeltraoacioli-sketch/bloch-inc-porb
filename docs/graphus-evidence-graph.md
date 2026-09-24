# Inspect saved evidence in Constellation

The [System Map workbench](https://bloch-graphus.xyz/map#module-workbench) opens its collected records directly in [Constellation](https://bloch-graphus.xyz/constellation.html?import=evidence). A full collection, a filtered subset or a selected public reference uses the captured dataset and retains its source snapshots. Opening the graph does not fetch a replacement network sample.

## Workflow

1. Capture public records in the System Map. Optionally collect earlier pages and apply exact ledger filters.
2. Choose **Graph this collection** for the complete capture, **Graph filtered records** for the current selection, or a reference button in the ledger to select that point within the filtered graph.
3. Inspect the selected reference, its direct neighbors, directed paths and exact source records. The graph displays a local-evidence mode indicator, dataset digest and source claims. Source provenance remains available even when timestamps are absent.
4. Export the collection or open it in Analytics. Both actions preserve the loaded packet, including its original digest and parent/filter lineage. Visual graph filters affect inspection; they do not modify the saved packet.
5. Reopen a full, baseline or filtered System Map JSON export through **Open System Map evidence JSON**. The file is read locally and is not uploaded.

The handoff uses the consumed `graphus.constellation.evidence.v1` session-storage item and `constellation.html?import=evidence`. An optional `reference` parameter identifies a point already in the imported dataset. It is not an address lookup request. A missing handoff, an invalid file or reloading after the handoff has been consumed leaves the saved-evidence view empty. The user can reopen the file or explicitly start a live collection.

## Data validation

The reader accepts System Map `graphus_network_collection` schema version 1 evidence packets with `dataset_sha256`, completeness diagnostics and explicit false flags for AML scores and identity attribution. Generic Constellation live-feed exports without this digest and comparison-only reports are outside this import format.

Files are bounded at 6 MB; the compact dataset remains bounded at 3 MB, eight source snapshots, 1,200 references and 4,000 records. Validation checks:

- Asset/network/source identity, source timestamps, block anchors and snapshot cursors.
- Typed reference IDs, unique events, exact integer amounts, transaction IDs, event positions and outpoints.
- Consistent block hashes, snapshot coverage counts, diagnostics and allowed fields.
- SHA-256 of UTF-8 `JSON.stringify(dataset)` with field and array order preserved.
- Parent digest and saved filter consistency for filtered packets.

A matching digest establishes consistency with the supplied dataset bytes. It does not authenticate the file's producer, independently verify a chain source or establish complete historical coverage. Imported source claims remain explicitly unverified. Unexpected properties are rejected instead of being carried into subsequent exports.

## Reference inspection

The selected point shows incident-record, transaction, returned-block and missing-timestamp counts. Exact base-unit amounts are grouped by recorded direction and event type. Self-reference records have a separate group and are counted once in the incident total. UTXO inputs and outputs retain separate types. These event totals are not current balances.

Direct neighbors are clickable; the panel lists up to 20 and the reference search can find any node in the filtered graph. Bitcoin base58 reference search is case-sensitive. EVM addresses and hexadecimal transaction/script references accept either case. The existing graph shows up to 450 references by connection count, plus the selected point and path; all loaded records remain in the packet. Paths are bounded at six recorded steps and do not establish chronology, ownership or continuity of value.

Imported collections disable collection controls and automatic polling. **Start a new live collection** clears the imported view and explicitly queries the selected network. Late responses from an earlier live request cannot replace the imported data or overwrite its status. Source queries from the reference's address/balance links remain explicit navigation actions.

## Verification

```sh
node --test tests/test_system_map.mjs tests/test_evidence_graph.mjs tests/test_graphus_collection.mjs
PLAYWRIGHT_MODULE=/path/to/playwright/index.mjs node scripts/check_evidence_graph_browser.mjs
GRAPHUS_MAP_ORIGIN=https://bloch-graphus.xyz PLAYWRIGHT_MODULE=/path/to/playwright/index.mjs node scripts/check_evidence_graph_browser.mjs
```

`GRAPHUS_MAP_ASSETS=USDC` narrows a live rerun to one or more comma-separated assets. Local browser checks use explicitly marked synthetic fixtures. Live checks capture actual source records in the System Map, confirm that graph exploration makes no new chain request, compare re-exported packets and dataset digests, inspect reference totals/neighbors/paths, open a filtered JSON file, hand off to Analytics and check mobile layout.

Local checks also reject modified datasets, handle empty packets and missing handoffs, preserve the selected reference from the workbench, ignore a delayed source error after import and verify an explicit return to live collection.
