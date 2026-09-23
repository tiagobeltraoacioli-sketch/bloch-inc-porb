# Dedicated infrastructure allocation — 2026-09-23

| Existing host | Role | Capacity observed | Current deployment boundary |
| --- | --- | --- | --- |
| `bloch-l2` | Reserved for chain 700771 L2 | 32 vCPU, ~125 GiB RAM, ~3 TB disk | Preserve Docker and L2 allocation. No BI-PoRB workload. |
| `bloch-dex` | BI-PoRB private data node | 32 vCPU, ~125 GiB RAM, ~3 TB disk | Official-list refresh and bounded Bloch indexer probe. No inbound service port. |
| `bloch-bridge` | Graphus graph/ML/ZK worker | 32 vCPU, ~125 GiB RAM, ~3 TB disk | Isolated code and state workspace; synthetic validation only until governed labels and feature data exist. No inbound service port. |

The DEX and Bridge hosts were inspected before reassignment. Neither had its planned application service running; L2 had its container runtime installed. Preserve the previous SSH aliases as an audit trail. New service accounts use no fleet SSH private key. The deployments must leave SSH and the host firewall unchanged.

## Data node

Deploy read-only code at `/opt/bi-porb`, private state at `/var/lib/bi-porb`, and aggregate status at `/var/lib/bi-porb/status`. Run source refreshes as unprivileged `porb` with systemd one-shot timers. OFAC files remain mode 0600 under a mode 0700 directory. Do not publish raw list files, customer IPs, identifiers, or wallet findings from this host. The Bloch job samples up to five transactions to verify the adapter; it is not a production indexer. Keep all service ports closed. Errors and freshness are visible in systemd journal and source status files.

Next data stages require separate go/no-go gates: chain-specific ingestion cursor and reorg tests; exact asset/network identity; data-source rights; encryption, backups, retention and deletion; tenant authorization; and a private transport design between data and ML hosts. Do not transfer raw regulated data to the ML host before those gates.

## Capacity planning

These 3 TB volumes are insufficient for a promise of complete archival history across Bloch, Ethereum, Solana, and Bitcoin. Allocate bounded, measurable windows first and alert before 70% disk use. Initial planning ceilings on the data host: 1.2 TB Bloch, 0.55 TB Bitcoin, 0.4 TB Ethereum derived events, 0.4 TB Solana derived events, 0.15 TB official/source snapshots, leaving at least 0.3 TB for OS, indexes, and headroom. These are **planning limits**, not preallocated quotas or evidence of stored history. Final storage policy must be benchmarked and revised from actual ingestion rates. Use each chain's public RPC or a rights-reviewed data source for bounded windows; a full Ethereum or Solana archive is a separate infrastructure project.

## ML and zero knowledge

The ML host is for temporal graph features, offline experiments, model validation, and proof benchmarks. Keep raw inputs and outcome labels off this machine until source rights, tenant isolation, encryption, retention, and cross-border transfer assessments are approved. Synthetic examples are never training evidence. Real model promotion needs temporal and entity-disjoint splits, independently reviewed labels, precision/recall and false-positive cost by chain, calibration, drift checks, and rollback.

For the first ZK experiment, prove a deterministic **small feature transform or model inference** against committed input and model hashes, then benchmark proof latency, memory, verification cost, and information leakage. This does not prove that input data are truthful, legal to use, or that the model is accurate. Never claim that ML training is zero-knowledge or that a commitment alone is a ZK proof. Select and license a current proof toolchain only after a reproducible benchmark. No ZK prover is currently deployed.

## Operational release gate

Before any external API, customer data, or automated enforcement: complete a field-level inventory, LGPD/GDPR role and legal-basis review, DPIA/RIPD decision, access and incident controls, security test, source license review, and human review workflow. The public site remains a synthetic dashboard with aggregate source metadata. No score or private evidence enters Bloch consensus.
