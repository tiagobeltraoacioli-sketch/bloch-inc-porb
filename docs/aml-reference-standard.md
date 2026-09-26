# Graphus / BI-PoRB AML/FT reference standard

This is an engineering and evidence standard for a future service, not a claim of regulatory certification, production coverage, or AML/FT effectiveness. The current private portal provides descriptive Red/Blue scores, an unsupervised nearest-neighbor baseline and official OFAC exact-identifier evidence. Public Graphus provides bounded source observations. These are not trained or validated AML classifications; there is no measured AML detection effectiveness. See [the current evidence and API contract](aml-data-enrichment.md).

## 1. Evidence layers

1. **Chain observation:** raw transaction, output or log, exact units, block/slot, source, finality, reorg and parse revision. A Bitcoin input references a prior output; it does not identify a person or prove wallet ownership.
2. **Official-source claim:** exact identifier, listing reference, jurisdiction, list version, retrieval time, effective date, expiry, and applicable restrictions. Keep named-person matching in a restricted store. OFAC is connected for private exact-identifier evidence only, with a six-hour portal source freshness window. UN, UK, and EU sources are candidates, not connected.
3. **Analytic hypothesis:** temporal path, fan-in/out, concentration, dwell time, cycle or pass-through candidate, with alternative explanations and missing-data flags. A FATF red flag prompts review; it is not a guilt label or an automatic reporting decision.
4. **ML feature and model:** public lawful feature definitions and reviewed non-score values, pinned model/card version, temporal/entity-disjoint evaluation, calibration, drift, uncertainty, and an independent comparison with transparent rules. No AML model is trained yet.
5. **Human decision:** named reviewer, reason, source context, uncertainty, challenge and correction route. Only an explicitly delegated, identity-verified person may see a future score. Customer action remains the customer's responsibility.

## 2. Coverage ledger

For every network and asset, publish the exact block/slot ranges indexed, gaps, last finalized event, source lag, parser version, reorg replay status, reconciliation sample, and unsupported transaction types. Keep ETH native, USDT ERC-20, and USDC ERC-20 separate. Do not merge token units or assign cross-chain continuity without a verified bridge message. Publish no percentage of chain coverage until measured against a documented denominator.

The first wave is BTC on Bitcoin mainnet; ETH, USDT and USDC on Ethereum mainnet; and BLCH on Bloch mainnet. Solana is deferred. A height probe is not transaction ingestion. Ethereum internal calls/traces, Bitcoin ownership clustering, Bloch sender resolution, and source-complete archives require separate validation before claims of coverage.

## 3. Data catalogue and source governance

The public [field atlas](../graphus/catalog.html) lists 84 fields with access and implementation status. Every new enrichment needs a source owner, permitted use, license, freshness target, parser tests, source digest, conflicting-claim procedure, and deletion/correction rule. Do not collapse a public allegation, model hypothesis, official designation, and human finding into one unqualified label.

Official candidates: [OFAC sanctions data](https://ofac.treasury.gov/sanctions-list-service) (current connector), [UN Security Council Consolidated List](https://main.un.org/securitycouncil/en/content/un-sc-consolidated-list), [UK Sanctions List](https://www.gov.uk/government/publications/the-uk-sanctions-list), and [European Commission sanctions resources](https://finance.ec.europa.eu/eu-and-world/sanctions-restrictive-measures/overview-sanctions-and-related-resources_en). The UK page states that its current list superseded the former OFSI consolidated list in January 2026; do not build a new connector against the retired feed. Each jurisdiction's legal effect and matching requirements need review before use.

## 4. ML release gates

- Label provenance: independently reviewed outcomes, adjudication, appeal and correction. Unreviewed proximity or a public blacklist cannot become a ground-truth label.
- Leakage control: time and entity-disjoint train/test partitions; no future events or neighborhood labels from the holdout period.
- Baseline comparison: transparent rules, simple tabular models, then temporal graph models. Complexity must improve measured review outcomes.
- Measured errors: precision at actual review capacity, recall, false-positive burden, calibration, and confidence intervals per network/asset and cohort.
- Stress tests: reorgs, sparse histories, exchange hubs, mixers, bridge failures, outdated sanctions source, missing IP context, adversarial graph patterns, and distribution drift.
- Operational release: independent validation, legal and privacy impact review, documented rollback, access audit, human review and correction route. No score publication before all gates pass.

## 5. Privacy and access

Public DaaS may include lawful chain facts, flow graphs, time series, regressions, dashboards and reviewed non-score ML detail as deeply as source rights and privacy allow. A field that trivially reconstructs the protected score is treated as a score. Private identity records, raw IP, tenant cases, confidential providers and personal notes remain restricted. IP-derived country is a short-lived, fallible customer-context signal, never a property of a blockchain address. The score service requires an explicit grant to a named, verified person, scoped to tenant, purpose, wallet/case, expiry and revocation, with audit on every request. Registration, employer category, or a government name alone does not grant access.

## 6. Product proof points

The claim “reference AML/FT platform” is earned by independent evidence: reproducible coverage ledger, third-party source lineage, evaluated error rates on held-out reviewed cases, operational freshness and replay measurements, published model cards, privacy impact records, access audit, and customer correction performance. Until these exist, public pages must say **preview**, **prototype**, **planned**, or **not live** at field level.
