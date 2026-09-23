# Graphus ZK research contract

The first proof target is a deterministic, bounded feature transform or small-model inference. Training, source attribution, legal rights, and reviewer decisions are **outside** the proof. A SHA-256 commitment is an integrity reference, not a zero-knowledge proof.

## Private witness

- Tenant-scoped, minimized feature vector from a finalized evidence graph; no names, raw IPs, documents, or seed phrases.
- Model parameters and feature transform version, if the customer agreement allows private model inputs.
- Source snapshot references and freshness checks, with any sensitive references hidden in the witness.

## Public statement

- Domain-separated commitment to the canonical input batch, model hash, feature schema hash, chain/network and finality policy version.
- Bounded output class or threshold result, when disclosure is approved. Prefer a narrow boolean and a confidence interval over publishing wallet scores.
- Proof system, circuit/guest image hash, verifier key, proof creation time, expiry, and replay nonce.

## Verification gates

1. Reject noncanonical serialization, unsupported network/asset, stale source, unfinalized inputs, oversized witness, and duplicate nonce.
2. Verify the cryptographic proof using pinned verifier artifacts. Recompute all public commitments and compare against authenticated data manifests.
3. Benchmark CPU RAM, proof time, verification time, output leakage, and cost on the dedicated 32-vCPU/125-GiB host. A failed benchmark leaves ZK disabled.
4. Never interpret proof validity as a claim that a wallet is illicit, a source is accurate, or an ML model is calibrated. Human review remains required.

The current release has **no proving key, verifier key, proof generator, or verified ZK output**. The existing Bloch L2 codebase already contains an SP1 6.8.0 integration, which can be evaluated as a research starting point after a license and reproducibility review. Keep the PoRB proof domain separate from L2 settlement and Bloch consensus.
