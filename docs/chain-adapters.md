# Initial asset adapter architecture

The first wave covers BTC, ETH, ERC-20 USDT/USDC on Ethereum, and BLCH. The code defines a normalized movement contract, offline ETH/ERC-20/BTC parsers, a [bounded private Ethereum finalized-block pilot](ethereum-private-pilot.md), and a [bounded private Bitcoin block pilot](bitcoin-private-pilot.md); it does **not** provide continuous chain ingestion. Separate, private Bloch indexer experiments collected bounded snapshots of 400 and 495 finalized transactions; neither establishes historical or live coverage. Solana's offline balance parser is retained for future research only. Every production adapter must emit source and finality evidence, retain a reversible cursor for reorg handling, and key event records by chain, network, asset, transaction, and event index. Score scales may be shared, but features and thresholds are calibrated per chain and asset.

| Chain | Primary observation | Key technical work | Attribution boundary |
| --- | --- | --- | --- |
| Bloch Protocol | [Historical indexer](https://github.com/tiagobeltraoacioli-sketch/bloch-sis-pow/tree/main/tools/bloch-indexer) plus Genesis-4 finality status | Read-only indexed eUTXO events, exact input/output values, slot and state-root lineage, reorg replay | Script hashes and transaction relationships do not identify a natural person |
| Ethereum | [Ethereum JSON-RPC](https://ethereum.org/developers/docs/apis/json-rpc/) blocks, receipts, logs and, where available, traces | Distinguish native transfers, ERC-20 event logs, internal calls, contracts, chain ID, finalized tag | Contract interactions and bridges complicate beneficial ownership; addresses may represent services |
| Solana — later phase | [Solana RPC](https://solana.com/docs/rpc/http/gettransaction) blocks/transactions with finalized commitment | Decode instructions and inner instructions, token balance deltas, address lookup tables, program versions, archival history | Signer, token account, owner, and program are distinct roles |
| Bitcoin | [Bitcoin Core RPC](https://bitcoincore.org/en/doc/31.0.0/rpc/) blocks and UTXO spends | Resolve inputs to previous outputs, change heuristics only as low-confidence hypotheses, reorganizations, dust and CoinJoin patterns | A transaction may have multiple inputs and outputs; no single sender can be asserted from an output |

## Analytics layers

1. **Raw acquisition:** node/indexer records retained only as needed and separated from identity data.
2. **Canonical events:** chain-specific adapters create finalized or confirmed movements, provenance, exact integer units, and reorg lineage.
3. **Behavioral features:** time-window velocity, fan-in/out, pass-through, peel chains, cycles, concentration, exposure path length, token swaps, bridge transitions, and cross-chain timing. Feature definitions carry chain/asset applicability and missingness.
4. **Evidence graph:** transaction, script/address, contract/program, asset, source record, and case nodes with explicit edge types and confidence. Graph proximity does not equal attribution or guilt.
5. **Red/Blue outputs:** transaction-level risk signals and wallet-level contextual reputation remain separate, with version, uncertainty, reason codes, source dates, expiry, and review state.
6. **Learning:** only reviewer-confirmed outcomes enter supervised training; use temporal holdouts, leakage controls, drift checks, and independent validation before promotion.

Multi-chain amounts are never compared as raw base units. Asset decimals, valuation timestamp, price source, and missing price status are explicit. Cross-chain links require bridge identifiers and verified mapping; timing correlation alone is a hypothesis. Sanctions-list matches require exact identifier and network verification. IP observations, when lawfully available from a customer's own access event, are separate private context and never inferred from a public chain transaction.

The offline parsers deliberately separate facts from interpretations: `service/ethereum.py` emits successful native-value transfers only when block and receipt identities agree; it also parses only allowlisted Ethereum-mainnet USDT/USDC `Transfer` logs with exact contract and event identity. It does not claim internal ETH calls, contract creation, mint/burn as wallet transfers, or arbitrary ERC-20 tokens. `service/bitcoin.py` emits confirmed outputs with unknown sender attribution, hashing scripts when no address is present. `service/solana.py` is later-phase research and emits balance deltas as observations, never a paired transfer or person-level ownership assertion. Each still requires live source reconciliation and reorg tests before production ingestion.

The private Bloch sample stores created outputs and spent-outpoint observations separately. An input identifies a consumed output, not a natural-person sender. Only 340 of 24,169 observed spent outpoints resolve within this small sample; the resulting 1.4068% is a within-sample linkage rate, not a chain-coverage estimate. The exported structural histogram contains no wallet or transaction identifiers and suppresses cells smaller than five, but it is not asserted to be anonymous. Its unsupervised groups describe transaction shapes, not AML risk.

The private [data evidence ledger](data-quality.md) reconciles the Bloch sample's digest, counts, source lineage, duplicate spends, and within-sample outpoint values/scripts. It also checks bounded Bitcoin block and Ethereum finalized-block pilots. Height probes remain separate from transaction ingestion; neither pilot establishes chain-wide coverage.

## Implementation sequence

Bloch indexer adapter first, then Ethereum native and USDT/USDC ERC-20 event ingestion, then Bitcoin UTXO input resolution. Solana is a later phase. Each network and asset goes through backfill, idempotency, reorg replay, reconciliation, and data-quality gates before appearing as live coverage in the dashboard.
