# Deployment verification — 2026-09-23

## Data host (`bloch-dex`)

- Release copied to `/opt/bi-porb`; root owns code.
- `porb` system user owns `/var/lib/bi-porb` (0700) and `/var/lib/bi-porb/private/ofac` (0700). The raw `sdn.csv` is 0600.
- `bi-porb-ofac.service` and `bi-porb-bloch.service` both exited with `0/SUCCESS` at 20:53 UTC.
- `bi-porb-chain-health.service` initially reported Ethereum, Solana, and Bitcoin heights at 20:59 UTC. After the asset-scope correction, its scheduled configuration probes Ethereum and Bitcoin only. It ingests zero transactions.
- All three timers are enabled. OFAC refresh runs about twice daily; Bloch and Ethereum/Bitcoin source probes about every fifteen minutes. The jobs only make outbound requests.
- The Bloch source reported indexer slot 118003, finalized height 88740, and ten finalized outputs in a five-transaction sample. These figures are source health observations, not chain-wide coverage or AML findings.
- A separate private, snapshot-pinned research backfill collected 400 finalized Bloch transactions over 20 pages of 20. It retained 688 created outputs and 24,169 spent-outpoint observations (24,857 records, about 13 MB), with no ownership claim or AML score. Only 340 spent outpoints resolve to a created output inside this bounded sample (1.4068%); this is **not** a chain coverage rate. Files and derived aggregate reports are under `/var/lib/bi-porb/private/bloch` with directory mode 0700 and file mode 0600.
- A structural histogram removed wallet/transaction identifiers, suppressed cells with fewer than five transactions, and accounted for 392 included, seven suppressed, and one structurally unrepresented transaction. No raw sample was sent to the ML host.

## Graph/ML host (`bloch-bridge`)

- Release copied to `/opt/bi-porb`; root owns code. `porbml` owns `/var/lib/bi-porb-ml` (0700).
- The graph feature and ML research tests passed under `porbml` on the host after the update. The complete 36-test Python suite and four Graphus API tests passed locally.
- A one-shot research benchmark trained five separate logistic baselines on 600 **synthetic** examples. Its private report is `/var/lib/bi-porb-ml/status/synthetic-ml-benchmark.json`, marked `synthetic_research_only`. It does not establish AML accuracy.
- A second, unsupervised structural experiment consumed only the reduced Bloch histogram. Three groups contain 284, 59, and 49 transactions; the report is `/var/lib/bi-porb-ml/status/structural-clusters.json`, marked `unsupervised_structural_research_only`. These are transaction-shape groups, not AML labels or wallet scores.
- Only SSH and local resolver ports were listening after deployment. No customer API, continuous trainer, or proof daemon is started.
- No GPU, Rust/Cargo, proof key, operational model weights, real training labels, or customer data were installed.

## Pending release gates

ETH, USDT/USDC ERC-20, and BTC transaction adapters are offline parsers only; no history from those networks is claimed as ingested. Bloch has a bounded, nonrepresentative private sample only. Solana is deferred. A first-wave production dataset, validated AML model, ZK proof, authenticated customer service, and legal compliance approval remain future work. The public site is a synthetic product preview with official source metadata only.

## Public preview

- `https://bloch-graphus.xyz/` and `https://bloch-graphus.pages.dev/` respond with the Graphus preview. The site includes the wallet constellation, 84-field data atlas, DaaS proposal, account preview, and interactive architecture map. Wallets, transactions, and per-wallet metrics are synthetic.
- `GET /api/daas/manifest` is live and explicitly returns `synthetic-preview`, `live_transactions=false`, and `live_scores=false`. `GET /api/config` returns `google_enabled=false` and `annotations_enabled=false` because Google was deferred and no login/database binding is active.
- `https://aml-blochinc.pages.dev/` is live with the corrected initial asset scope. `aml-blochinc.xyz` does not currently resolve in public DNS.
- `https://blochinc.xyz/` links to Graphus in the product navigation, card, and footer.
