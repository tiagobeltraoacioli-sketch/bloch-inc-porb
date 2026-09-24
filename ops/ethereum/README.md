# Graphus Ethereum state source

`bloch-bridge` runs Erigon v3.6.1 in archive mode with its embedded Caplin
consensus client. The initial full-node configuration was changed before the
first sync completed because full mode prunes old logs and state history needed
for complete USDT/USDC holder discovery. Only the 1.9 MB initial `chaindata`
was reset; downloaded immutable snapshots were retained for reuse.
The command is recorded in `run-erigon.sh`; it will not replace an existing
container. Execution and consensus RPC listeners are bound to loopback. The
container is capped at 16 CPUs and 48 GB of memory. State resides in
`/var/lib/graphus/ethereum` and is private to its service UID.

Check progress with `sudo docker logs --tail 30 graphus-erigon` and query
`eth_syncing` and the finalized block over local JSON-RPC. Snapshot download
progress alone is not proof of a fully validated tip. Before enumerating ETH
accounts, validate the execution and consensus sync states and record a single
finalized block hash. The local `debug` RPC module is enabled for testing
`debug_accountRange` pagination on that pinned block. USDT and USDC need
contract-specific holder discovery plus `balanceOf` at the same block; ETH
account enumeration cannot establish token-holder completeness by itself.
Run `python3 -m service.chain_node_status` from the authorized workstation for
one read-only JSON view of both nodes, including RPC sync, the downloader's
reported phase progress, and disk space. It does not trigger a collector.

Erigon estimates roughly 2.03 TB for an Ethereum archive node and recommends
a 4 TB disk. This host has a 3 TB volume, so monitor real usage and stop the
sync before the reserve is exhausted. The receipt cache remains disabled to
avoid its additional disk cost; historical log reads may be slower.
The `graphus-erigon-disk-guard.timer` checks filesystem use every ten minutes
and stops the container at 85% use, leaving roughly 450 GB free on a 3 TB
volume. Inspect the journal and add capacity before restarting if it trips.

The `graphus-token-candidates@USDT.timer` and `@USDC.timer` retry a private
`Transfer` log scan after the archive sync completes. Each run processes at
most 1,000 ranges of up to 500 blocks, commits a cursor and candidate set in
SQLite, and resumes at the first unscanned block. Excess-result errors split
the range rather than skip it. The target is one pinned finalized block.
Scanning all emitted `Transfer` events still does not prove that every holder
was discovered, and no `balanceOf` ranking is produced at this stage. The
index files remain mode 0600 on the host and have no public endpoint.
The `graphus-token-balances@USDT.timer` and `@USDC.timer` wait for complete
event scans, then query `balanceOf` in bounded batches against that same
finalized block hash. A private top-64 of **event-discovered** addresses is
available only after all candidate balance reads complete. This still lacks an
independent contract-state coverage proof and must not be labeled as the global
holder ranking. The private top-64 reader rechecks both completion flags,
compares candidate and balance row coverage, and rejects malformed addresses
or decimal amounts before returning a ranking.

References: [Erigon hardware requirements](https://docs.erigon.tech/get-started/hardware-requirements),
[Caplin](https://docs.erigon.tech/fundamentals/caplin),
[pruning modes](https://docs.erigon.tech/fundamentals/pruning-modes),
[debug account range](https://docs.erigon.tech/interacting-with-erigon/debug).
