# Deployment verification — 2026-09-23

## Data host (`bloch-dex`)

- Release copied to `/opt/bi-porb`; root owns code.
- `porb` system user owns `/var/lib/bi-porb` (0700) and `/var/lib/bi-porb/private/ofac` (0700). The raw `sdn.csv` is 0600.
- `bi-porb-ofac.service` and `bi-porb-bloch.service` both exited with `0/SUCCESS` at 20:53 UTC.
- `bi-porb-chain-health.service` also exited with `0/SUCCESS` at 20:59 UTC, reporting an Ethereum finalized height, Solana finalized slot, and Bitcoin tip height from public endpoints. It ingested zero transactions.
- All three timers are enabled. OFAC refresh runs about twice daily; Bloch and three-chain source probes about every fifteen minutes. The jobs only make outbound requests.
- The Bloch source reported indexer slot 118003, finalized height 88740, and ten finalized outputs in a five-transaction sample. These figures are source health observations, not chain-wide coverage or AML findings.

## Graph/ML host (`bloch-bridge`)

- Release copied to `/opt/bi-porb`; root owns code. `porbml` owns `/var/lib/bi-porb-ml` (0700).
- Fourteen repository tests passed under `porbml` on the host after the Graphus update, including time-ordered graph paths, source probes, and temporal/entity-disjoint ML evaluation gates.
- Only SSH and local resolver ports were listening after deployment. No API, trainer, or proof daemon is started.
- No GPU, Rust/Cargo, proof key, model weights, real training labels, or customer data were installed.

## Pending release gates

Ethereum, Solana, and Bitcoin transaction adapters are still design-stage; no history from those chains is claimed as ingested. A four-chain production dataset, live model, ZK proof, authenticated customer service, and legal compliance approval remain future work. The public site is a synthetic product preview with official source metadata only.

## Public preview

- `https://bloch-graphus.pages.dev/` responds with the Graphus of Bloch Inc product preview. The page includes an interactive four-chain architecture map and explicitly labels future capabilities.
- `bloch-graphus.xyz` is attached to that Pages project but awaits an apex DNS CNAME. The Pages credential cannot read or write DNS records (HTTP 403).
- `https://blochinc.xyz/` links to Graphus in the product navigation, card, and footer.
