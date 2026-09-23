# Deployment verification — 2026-09-23

## Data host (`bloch-dex`)

- Release copied to `/opt/bi-porb`; root owns code.
- `porb` system user owns `/var/lib/bi-porb` (0700) and `/var/lib/bi-porb/private/ofac` (0700). The raw `sdn.csv` is 0600.
- `bi-porb-ofac.service` and `bi-porb-bloch.service` both exited with `0/SUCCESS` at 20:53 UTC.
- Their timers are enabled. OFAC refresh runs about twice daily; Bloch source probe about every fifteen minutes. Both jobs only make outbound requests.
- The Bloch source reported indexer slot 118003, finalized height 88740, and ten finalized outputs in a five-transaction sample. These figures are source health observations, not chain-wide coverage or AML findings.

## Graph/ML host (`bloch-bridge`)

- Release copied to `/opt/bi-porb`; root owns code. `porbml` owns `/var/lib/bi-porb-ml` (0700).
- Eleven repository tests passed under `porbml` on the host, including graph path constraints and temporal/entity-disjoint ML evaluation gates.
- Only SSH and local resolver ports were listening after deployment. No API, trainer, or proof daemon is started.
- No GPU, Rust/Cargo, proof key, model weights, real training labels, or customer data were installed.

## Pending release gates

Ethereum, Solana, and Bitcoin source adapters are still design-stage; no history from those chains is claimed as ingested. A four-chain production dataset, live model, ZK proof, authenticated customer service, and legal compliance approval remain future work. The public site is a synthetic product preview with official source metadata only.
