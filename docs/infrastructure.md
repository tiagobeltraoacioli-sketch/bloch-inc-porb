# Dedicated infrastructure allocation — 2026-09-23

| Existing host | Role | Capacity observed | Current deployment boundary |
| --- | --- | --- | --- |
| `bloch-l2` | Reserved for chain 700771 L2 | 32 vCPU, ~125 GiB RAM, ~3 TB disk | Preserve Docker and L2 allocation. No BI-PoRB workload. |
| `bloch-dex` | BI-PoRB private data node | 32 vCPU, ~125 GiB RAM, ~3 TB disk | Official-list refresh and bounded Bloch indexer probe. No inbound service port. |
| `bloch-bridge` | Graphus graph/ML/ZK worker | 32 vCPU, ~125 GiB RAM, ~3 TB disk | Isolated code and state workspace; synthetic validation only until governed labels and feature data exist. No inbound service port. |

## Chain node deployment — 2026-09-24

The two dedicated hosts now also carry isolated chain state sources for the
requested holder index. On `bloch-dex`, the verified official Bitcoin Core 31.1
binary runs as `graphusbtc` through `graphus-bitcoind.service`, limited to eight
CPU cores and 32 GB RAM. Its 100 GB prune target retains current UTXO state.
Its RPC listens only on `127.0.0.1:8332`; BI-PoRB timers remained active after
deployment. On `bloch-bridge`, the pinned Erigon v3.6.1 image runs in archive
mode with embedded Caplin, limited to 16 CPU cores and 48 GB RAM. Its RPC and private interfaces
listen only on loopback. Both nodes were in initial sync at last inspection;
neither is yet a source for a complete holder ranking. The Erigon initial full
mode was replaced during early sync because it cannot serve old token logs;
only its 1.9 MB `chaindata` was reset while snapshots were retained. See `ops/bitcoin` and
`ops/ethereum` for the deployed configuration and progress checks.

A read-only check on 2026-09-24 around 05:26 UTC found Bitcoin Core at block
549,934 of 968,361 reported headers, `verificationprogress=0.252087`, and
`initialblockdownload=true`. Erigon was still downloading snapshots at 34.04%
(704.1 GB of 2.0 TB); its downloader estimated about six more hours for that
phase alone. Neither observation establishes a completion date for full sync,
index construction, or validated holder rankings.

A second read-only check around 10:02 UTC found Bitcoin Core at block 774,371
of 968,382 headers, with `initialblockdownload=true` and verification progress
0.56636. Erigon reported execution block 0 while its snapshot downloader was
at 83.71%; the downloader's approximately 1h30m ETA covers that download
phase, not subsequent execution sync or indexing. The Ethereum volume had
about 1.16 TB available. The private Bitcoin ranking and token scans remained
behind their node-sync gates. Run `python3 -m service.chain_node_status` from
the authorized workstation for a fresh, read-only JSON status; it does not
publish node data or claim that a holder ranking is ready.

At approximately 10:19 UTC, the status command found Bitcoin at 783,980 of
968,386 headers with IBD still active, and Erigon at 86.77% snapshot download
with execution block 0. The Bitcoin snapshot job was updated on `bloch-dex`
to repeat its canonical base-block and IBD checks after conversion and snapshot
hashing, immediately before writing the private ranking. The installed file
matched the local SHA-256, and a read-only `--check-only` run returned
`waiting_for_full_validation` at block 785,954. No snapshot or ranking was
created by that verification.

At approximately 10:30 UTC, Bitcoin remained in IBD at block 790,272 of
968,386 headers. Erigon remained in snapshot download at 88.73%, with execution
block 0 and about 1.04 TB available. The private USDT/USDC top-64 reader now
rechecks transfer-scan completion, same-block balance completion, and one-to-one
candidate balance coverage before it returns a result. This is an index
integrity gate, not a claim that Transfer events discover every token holder.

The Ethereum balance timers now materialize one mode-0600, immutable private
top-64 JSON per token after all event-discovered candidates have same-block
balances. They recheck the pinned block just before the atomic write. These
files are staged for review only; they are not connected to the public map.
`service.private_artifact_review` provides a separate file-level check on each
completed private artifact. Its JSON output contains only the asset, anchor,
row count, file digest, and review state. It never marks public release ready.
The read-only `service.chain_node_status` command also reports whether each
private BTC, USDT, and USDC file is absent, present with mode 0600, invalid, or
unavailable. Presence still requires the independent artifact review; the
status command never includes wallet identifiers or marks publication ready.
The standalone reviewer was installed on both data hosts and its command-line
entry point was verified under each unprivileged service account. It will
return a review summary only after an artifact exists; no private ranking or
public release was created during installation.
The updated service units and collector module were installed on `bloch-bridge`.
A controlled USDT/USDC service run at 10:49 UTC returned
`waiting_for_archive_sync` for both assets and created no index files. At the
preceding 10:46 UTC check, Bitcoin was at 798,589 of 968,387 headers with IBD
active; Erigon had downloaded 91.71% of snapshots, reported execution block 0,
and had about 978 GB available. The downloader's ETA applies only to snapshots.

Private timers now gate further work on node readiness. The Bitcoin snapshot
job checks `initialblockdownload=false` before exporting and wrote no ranking
while validation was in progress. On the bridge, USDT and USDC Transfer-event
scanners wait for Erigon archive sync, then resume from persisted block cursors;
same-block `balanceOf` collectors wait for those scans. A separate disk guard
checks the bridge volume every ten minutes and stops Erigon at 85% use.
Neither candidate sets nor rankings are connected to the public site.

The previous planning allocation below predates this deployment. Actual disk
usage and bandwidth must be measured during sync and before reserving space for
Bloch state, token-event indexes, or ML data. The Ethereum archive node is
not itself a complete holder index or a public API. Node completion,
snapshot anchoring, complete candidate discovery, and ranking validation are
separate milestones.

The DEX and Bridge hosts were inspected before reassignment. Neither had its planned application service running; L2 had its container runtime installed. Preserve the previous SSH aliases as an audit trail. New service accounts use no fleet SSH private key. The deployments must leave SSH and the host firewall unchanged.

## Data node

Deploy read-only code at `/opt/bi-porb`, private state at `/var/lib/bi-porb`, and aggregate status at `/var/lib/bi-porb/status`. Run source refreshes as unprivileged `porb` with systemd one-shot timers. OFAC files remain mode 0600 under a mode 0700 directory. Do not publish raw list files, customer IPs, identifiers, or wallet findings from this host. The Bloch job samples up to five transactions to verify the adapter; it is not a production indexer. Keep all service ports closed. Errors and freshness are visible in systemd journal and source status files.

Next data stages require separate go/no-go gates: chain-specific ingestion cursor and reorg tests; exact asset/network identity; data-source rights; encryption, backups, retention and deletion; tenant authorization; and a private transport design between data and ML hosts. Do not transfer raw regulated data to the ML host before those gates.

## Capacity planning

These 3 TB volumes are insufficient for a promise of complete archival history across all initial networks. The earlier provisional ceilings on the data host are superseded by the actual deployment: Bitcoin state is on `bloch-dex`, while the Ethereum archive is on `bloch-bridge`. Erigon currently estimates about 2.03 TB of Ethereum archive data and recommends a 4 TB disk. The 3 TB bridge volume therefore needs active free-space monitoring and a stop threshold before the remaining reserve is exhausted. Bloch state, token-event indexes, graph data, and ML storage still need measured allocations. Solana is deferred.

## ML and zero knowledge

The ML host is for temporal graph features, offline experiments, model validation, and proof benchmarks. Keep raw inputs and outcome labels off this machine until source rights, tenant isolation, encryption, retention, and cross-border transfer assessments are approved. Synthetic examples are never training evidence. Real model promotion needs temporal and entity-disjoint splits, independently reviewed labels, precision/recall and false-positive cost by chain, calibration, drift checks, and rollback.

For the first ZK experiment, prove a deterministic **small feature transform or model inference** against committed input and model hashes, then benchmark proof latency, memory, verification cost, and information leakage. This does not prove that input data are truthful, legal to use, or that the model is accurate. Never claim that ML training is zero-knowledge or that a commitment alone is a ZK proof. Select and license a current proof toolchain only after a reproducible benchmark. No ZK prover is currently deployed.

## Operational release gate

Before any external API, customer data, or automated enforcement: complete a field-level inventory, LGPD/GDPR role and legal-basis review, DPIA/RIPD decision, access and incident controls, security test, source license review, and human review workflow. The public site remains a synthetic dashboard with aggregate source metadata. No score or private evidence enters Bloch consensus.
