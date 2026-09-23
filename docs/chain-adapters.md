# Four-chain data architecture

The current code defines a normalized movement contract; it does **not** connect live chain nodes. Every adapter must emit source and finality evidence, retain a reversible cursor for reorg handling, and key event records by chain, network, asset, transaction, and event index. Score scales may be shared, but features and thresholds are calibrated per chain and asset.

| Chain | Primary observation | Key technical work | Attribution boundary |
| --- | --- | --- | --- |
| Bloch Protocol | [Historical indexer](https://github.com/tiagobeltraoacioli-sketch/bloch-sis-pow/tree/main/tools/bloch-indexer) plus Genesis-4 finality status | Read-only indexed eUTXO events, exact input/output values, slot and state-root lineage, reorg replay | Script hashes and transaction relationships do not identify a natural person |
| Ethereum | [Ethereum JSON-RPC](https://ethereum.org/developers/docs/apis/json-rpc/) blocks, receipts, logs and, where available, traces | Distinguish native transfers, ERC-20 event logs, internal calls, contracts, chain ID, finalized tag | Contract interactions and bridges complicate beneficial ownership; addresses may represent services |
| Solana | [Solana RPC](https://solana.com/docs/rpc/http/gettransaction) blocks/transactions with finalized commitment | Decode instructions and inner instructions, token balance deltas, address lookup tables, program versions, archival history | Signer, token account, owner, and program are distinct roles |
| Bitcoin | [Bitcoin Core RPC](https://bitcoincore.org/en/doc/31.0.0/rpc/) blocks and UTXO spends | Resolve inputs to previous outputs, change heuristics only as low-confidence hypotheses, reorganizations, dust and CoinJoin patterns | A transaction may have multiple inputs and outputs; no single sender can be asserted from an output |

## Analytics layers

1. **Raw acquisition:** node/indexer records retained only as needed and separated from identity data.
2. **Canonical events:** chain-specific adapters create finalized or confirmed movements, provenance, exact integer units, and reorg lineage.
3. **Behavioral features:** time-window velocity, fan-in/out, pass-through, peel chains, cycles, concentration, exposure path length, token swaps, bridge transitions, and cross-chain timing. Feature definitions carry chain/asset applicability and missingness.
4. **Evidence graph:** transaction, script/address, contract/program, asset, source record, and case nodes with explicit edge types and confidence. Graph proximity does not equal attribution or guilt.
5. **Red/Blue outputs:** transaction-level risk signals and wallet-level contextual reputation remain separate, with version, uncertainty, reason codes, source dates, expiry, and review state.
6. **Learning:** only reviewer-confirmed outcomes enter supervised training; use temporal holdouts, leakage controls, drift checks, and independent validation before promotion.

Multi-chain amounts are never compared as raw base units. Asset decimals, valuation timestamp, price source, and missing price status are explicit. Cross-chain links require bridge identifiers and verified mapping; timing correlation alone is a hypothesis. Sanctions-list matches require exact identifier and network verification. IP observations, when lawfully available from a customer's own access event, are separate private context and never inferred from a public chain transaction.

## Implementation sequence

Bloch indexer adapter first, then Ethereum, Bitcoin, and Solana ingestion. This order allows the Bloch service to be useful early while leaving room for specialized pipelines. Each network goes through backfill, idempotency, reorg replay, reconciliation, and data-quality gates before appearing as live coverage in the dashboard.
