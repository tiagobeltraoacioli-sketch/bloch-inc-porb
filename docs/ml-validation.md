# Learning system and accuracy gates

More data can improve a model only when observations and outcome labels are reliable, comparable, lawful to use, and representative of future activity. BI-PoRB separates the following:

1. **Factual observations:** finalized transfer graph, amount normalized per asset, timing, source-linked address attributions, exact official-list identifiers, and optional private customer network context.
2. **Rules:** transparent reason codes for velocity, fan-in/out, pass-through, cyclic flows, new counterparties, and source freshness. Rules indicate review priority, not illicit activity.
3. **Outcomes:** reviewer-confirmed case resolution with evidence and timestamp. "No report" or "no dispute" is not a negative label.
4. **Offline training:** temporal train/validation/test splits, entity/cluster leakage controls, class imbalance handling, model/version manifests, and reproducible feature transforms.
5. **Promotion:** compare with the current rules baseline on precision, recall, false-positive rate, calibration, review workload, and subgroup/network coverage. Hold out recent periods and monitor drift. A model change requires documented human approval and rollback.

No model may learn from unverified sanctions hints, community allegations, or inferred person-level crime labels as ground truth. A model score must include feature/source provenance, uncertainty, expiry, and a human review route. The supplied Rust simulation is research evidence only; its reported detection rates do not validate a live BI-PoRB model.

## Implemented research components

- `service/graph_analytics.py` computes source-linked, chain/asset-isolated wallet activity, daily volumes, concentration, inter-event gap variation, descriptive regression, and bounded time-ordered paths. It rejects heuristic senders and does not turn Bitcoin outputs into sender-to-recipient edges. The output explicitly says that paths are associations and value continuity is unproven.
- `service/ml_validation.py` validates reviewed binary labels, time and entity-disjoint holdouts, and transparent confusion counts with undefined denominators left as `null`.
- `service/ml_research.py` trains a regularized logistic baseline **only** on independently reviewed examples, using training-only normalization, a bounded optimizer, a held-out split, Brier score, and precision at a stated review capacity. It returns a research report rather than a wallet score or serving artifact. Distinct networks and assets are never pooled into one model.
- `scripts/ml_research_benchmark.py` generated 600 entirely synthetic cases across the five initial assets and trained five baseline experiments on the graph host. Its private output is tagged `synthetic_research_only`. The sample verifies computation and isolation checks; it says nothing about real AML accuracy.
- `service/bloch_backfill.py` collected a private, cursor-pinned sample of 400 finalized Bloch transactions. `service/bloch_sample_analysis.py` checks its digest and reports structural completeness without identifiers. `service/structural_histogram.py` exported only binned transaction-shape counts, suppressing cells smaller than five, to the graph host. `service/aggregate_ml.py` trained a weighted, unsupervised three-group structural model on those counts. The 284/59/49 groups are transaction shapes, not AML categories, wallet scores, or evidence of model accuracy. One sampled transaction had no retained input/output structure and is accounted for separately.

The next model stage needs lawfully sourced, outcome-reviewed cases and a coverage ledger. Compare transparent rules, tabular baselines, and temporal graph models under the same entity-disjoint future holdout. Publish reviewed non-score features, regression specifications, validation methods, error bars, and limitations to the public. Only a validated AML score goes through named-person delegation. Public coefficients and wallet features must not reconstruct the protected score exactly.
