# Learning system and accuracy gates

More data can improve a model only when observations and outcome labels are reliable, comparable, lawful to use, and representative of future activity. BI-PoRB separates the following:

1. **Factual observations:** finalized transfer graph, amount normalized per asset, timing, source-linked address attributions, exact official-list identifiers, and optional private customer network context.
2. **Rules:** transparent reason codes for velocity, fan-in/out, pass-through, cyclic flows, new counterparties, and source freshness. Rules indicate review priority, not illicit activity.
3. **Outcomes:** reviewer-confirmed case resolution with evidence and timestamp. "No report" or "no dispute" is not a negative label.
4. **Offline training:** temporal train/validation/test splits, entity/cluster leakage controls, class imbalance handling, model/version manifests, and reproducible feature transforms.
5. **Promotion:** compare with the current rules baseline on precision, recall, false-positive rate, calibration, review workload, and subgroup/network coverage. Hold out recent periods and monitor drift. A model change requires documented human approval and rollback.

No model may learn from unverified sanctions hints, community allegations, or inferred person-level crime labels as ground truth. A model score must include feature/source provenance, uncertainty, expiry, and a human review route. The supplied Rust simulation is research evidence only; its reported detection rates do not validate a live BI-PoRB model.
