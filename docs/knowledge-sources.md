# BlochAI reviewed knowledge sources

Reviewed on 2026-09-28. This release contains 60 portal/topic combinations: 20 each for Graphus, Bloch Space and Bloch Explorer. It is authored educational and interpretation material, not private customer data, a transaction corpus, a trained model or evidence that a feature is active on a network.

The canonical content is `blockai/network/chain_knowledge.json` in BlochAI. The portal release mirrors it as `deploy/blochai-public/knowledge.js`. Each topic preserves `title`, `question`, `keywords`, `notes` and `sources`, and adds `networks` and `reviewed_at`. A topic is eligible only for the listed networks. Explorer topics are Bloch-only. English notes are paraphrases; Portuguese search keywords do not change their scope.

`knowledge-sources.json` records the source registry, reference commits and a SHA-256 of the canonical compact JSON. The digest detects mirror drift; it is not a signature or an external audit. Sources remain references, with no invented retrieval timestamp or current network measurement. The reviewed date means editorial review, not live-source freshness.

## Evidence boundaries

- Bitcoin notes use the primary developer guides and the BIP repositories. Older RPC examples describe field semantics; they are not a declaration of current defaults, universal mempool policy or a confirmation guarantee.
- Ethereum notes use ethereum.org and the official EIP/ERC repositories. Receipt execution, event logs, balance state, gas cost and checkpoint finality remain separate. No note equates a token symbol with a contract identity or a contract event with a native ETH payment.
- Bloch protocol references are pinned to `35d8c3029e3c7ee5417502d6c2b728184dd17b0e`. The review read the RPC, fee-market, transition, finality and activation-parameter code, plus the funded-admission specification. This is the inspected source revision, not an assertion that every deployed node runs it.
- In that Bloch reference, funded-validator admission and multiple lifecycle gates use the unarmed sentinel. The reference also distinguishes output-based records from legacy VM and proposed transaction-class support. Consequently the notes require deployed-version and activation evidence; they do not announce deposits, withdrawals, an EVM, VM compatibility or payouts as live.
- Graphus/Bloch Space contracts are pinned to portal revision `42cac3e1bfda682ba7df92371eb26ac341d81ea6`. They support statements about bounded pages, graph records, asset namespaces, exact units and source-reported observations. A newer source implementation requires another review; limits shown by the live adapter remain authoritative for that response.
- A graph path, a validator key, an address balance or a transaction record does not establish a person, common ownership, intent, wrongdoing or a validated risk score. No private labels, AML records, raw IPs, organization instructions or customer cases were used.

## Use in evaluation and training

The notes may supply reviewed reference answers for generated educational examples. Those examples must be marked synthetic, separated by held-out topic/network intent, and checked for source fidelity. They must not be described as observed transactions or used to imply that a model has learned live balances. Public source summaries keep their deterministic evidence boundary unless a separately measured release changes it. BlochAI GPU contribution rewards remain a future product feature, distinct from validator lifecycle rules.

## Source registry

The links below are the primary references actually reviewed from official documentation or local source code. Commit-pinned GitHub URLs identify the inspected files. Project home pages are navigation/provenance references, not support for invented measurements.

| Source ID | Reference | Kind |
| --- | --- | --- |
| `bloch_admission` | [Bloch funded-validator admission and release boundaries](https://github.com/tiagobeltraoacioli-sketch/bloch-sis-pow/blob/35d8c3029e3c7ee5417502d6c2b728184dd17b0e/docs/specs/BLOCH-FUNDED-VALIDATOR-ADMISSION.md) | Pinned project implementation |
| `bloch_fee` | [Bloch reviewed gas and fee arithmetic](https://github.com/tiagobeltraoacioli-sketch/bloch-sis-pow/blob/35d8c3029e3c7ee5417502d6c2b728184dd17b0e/crates/bloch-pos-committee/src/fee_market.rs) | Pinned project implementation |
| `bloch_finality` | [Bloch reviewed checkpoint finality implementation](https://github.com/tiagobeltraoacioli-sketch/bloch-sis-pow/blob/35d8c3029e3c7ee5417502d6c2b728184dd17b0e/crates/bloch-pos-committee/src/finality.rs) | Pinned project implementation |
| `bloch_params` | [Bloch reviewed epoch and activation parameters](https://github.com/tiagobeltraoacioli-sketch/bloch-sis-pow/blob/35d8c3029e3c7ee5417502d6c2b728184dd17b0e/crates/bloch-pos-committee/src/params.rs) | Pinned project implementation |
| `bloch_reference` | [Bloch reviewed protocol and capability reference](https://github.com/tiagobeltraoacioli-sketch/bloch-sis-pow/blob/35d8c3029e3c7ee5417502d6c2b728184dd17b0e/README.md) | Pinned project implementation |
| `bloch_rpc` | [Bloch reviewed RPC field definitions](https://github.com/tiagobeltraoacioli-sketch/bloch-sis-pow/blob/35d8c3029e3c7ee5417502d6c2b728184dd17b0e/crates/bloch-pos-node/src/rpc.rs) | Pinned project implementation |
| `bloch_transition` | [Bloch reviewed state transition and output rules](https://github.com/tiagobeltraoacioli-sketch/bloch-sis-pow/blob/35d8c3029e3c7ee5417502d6c2b728184dd17b0e/crates/bloch-pos-committee/src/transition.rs) | Pinned project implementation |
| `btc_chain` | [Bitcoin chain selection and confirmations](https://developer.bitcoin.org/devguide/block_chain.html) | Official documentation |
| `btc_headers` | [Bitcoin block header fields](https://developer.bitcoin.org/reference/block_chain.html) | Official documentation |
| `btc_mempool` | [Bitcoin node mempool measurements](https://developer.bitcoin.org/reference/rpc/getmempoolinfo.html) | Official documentation |
| `btc_payment` | [Bitcoin payment and confirmation observations](https://developer.bitcoin.org/devguide/payment_processing.html) | Official documentation |
| `btc_tx` | [Bitcoin transaction structure](https://developer.bitcoin.org/devguide/transactions.html) | Official documentation |
| `btc_wallet` | [Bitcoin wallet and change handling](https://developer.bitcoin.org/devguide/wallets.html) | Official documentation |
| `btc_weight` | [BIP141 transaction weight and virtual size](https://github.com/bitcoin/bips/blob/master/bip-0141.mediawiki) | Protocol standard |
| `eth_accounts` | [Ethereum account state](https://ethereum.org/developers/docs/accounts/) | Official documentation |
| `eth_blocks` | [Ethereum execution and consensus block fields](https://ethereum.org/developers/docs/blocks/) | Official documentation |
| `eth_erc20` | [ERC20 token balances, events and allowance](https://github.com/ethereum/ERCs/blob/master/ERCS/erc-20.md) | Protocol standard |
| `eth_gas` | [Ethereum gas and fee accounting](https://ethereum.org/developers/docs/gas/) | Official documentation |
| `eth_pos` | [Ethereum proof of stake and checkpoint finality](https://ethereum.org/developers/docs/consensus-mechanisms/pos/) | Official documentation |
| `eth_receipt_status` | [EIP658 receipt execution status](https://github.com/ethereum/EIPs/blob/master/EIPS/eip-658.md) | Protocol standard |
| `eth_rewards` | [Ethereum validator rewards and penalties](https://ethereum.org/developers/docs/consensus-mechanisms/pos/rewards-and-penalties/) | Official documentation |
| `eth_rpc` | [Ethereum JSON-RPC transaction and receipt fields](https://ethereum.org/developers/docs/apis/json-rpc/) | Official documentation |
| `eth_tokens` | [Ethereum ERC20 token overview](https://ethereum.org/developers/docs/standards/tokens/erc-20/) | Official documentation |
| `eth_tx` | [Ethereum transaction fields](https://ethereum.org/developers/docs/transactions/) | Official documentation |
| `explorer` | [Bloch public explorer](https://blochl1.com/) | Project reference |
| `graphus` | [Graphus public observations](https://bloch-graphus.xyz/) | Project reference |
| `graphus_bloch` | [Graphus Bloch script-history adapter at the reviewed release](https://github.com/tiagobeltraoacioli-sketch/bloch-inc-porb/blob/42cac3e1bfda682ba7df92371eb26ac341d81ea6/graphus/chain/bloch-chain.js) | Pinned project implementation |
| `graphus_collection` | [Graphus observation and collection contract](https://github.com/tiagobeltraoacioli-sketch/bloch-inc-porb/blob/42cac3e1bfda682ba7df92371eb26ac341d81ea6/docs/graphus-real-network-feed.md) | Pinned project implementation |
| `graphus_network` | [Graphus bounded network adapter at the reviewed release](https://github.com/tiagobeltraoacioli-sketch/bloch-inc-porb/blob/42cac3e1bfda682ba7df92371eb26ac341d81ea6/graphus/chain/network-graph.js) | Pinned project implementation |
| `space` | [Bloch Space public chain workspace](https://bloch.space/app/) | Project reference |
| `space_adapter` | [Bloch Space public observation and transaction contracts](https://github.com/tiagobeltraoacioli-sketch/bloch-inc-porb/blob/42cac3e1bfda682ba7df92371eb26ac341d81ea6/space/chain/explorer.js) | Pinned project implementation |

## Network relevance inventory

### Graphus

| Topic | Networks |
| --- | --- |
| `connections` | bitcoin, ethereum, bloch |
| `readings` | bitcoin, ethereum, bloch |
| `coverage` | bitcoin, ethereum, bloch |
| `wallet_summary` | bitcoin, ethereum, bloch |
| `transaction_analysis` | bitcoin, ethereum, bloch |
| `graph_analysis` | bitcoin, ethereum, bloch |
| `transactions` | bitcoin, ethereum, bloch |
| `utxo` | bitcoin, bloch |
| `accounts` | ethereum |
| `fees` | bitcoin, ethereum, bloch |
| `finality` | bitcoin, ethereum, bloch |
| `change_outputs` | bitcoin |
| `asset_units` | bitcoin, ethereum, bloch |
| `receipt_status` | ethereum |
| `token_events` | ethereum |
| `graph_paths` | bitcoin, ethereum, bloch |
| `sampling_bias` | bitcoin, ethereum, bloch |
| `block_anchors` | bitcoin, ethereum, bloch |
| `duplicate_records` | bitcoin, ethereum, bloch |
| `token_approvals` | ethereum |

### Space

| Topic | Networks |
| --- | --- |
| `observations` | bitcoin, ethereum, bloch |
| `freshness` | bitcoin, ethereum, bloch |
| `coverage` | bitcoin, ethereum, bloch |
| `wallet_summary` | bitcoin, ethereum, bloch |
| `transaction_analysis` | bitcoin, ethereum, bloch |
| `graph_analysis` | bitcoin, ethereum, bloch |
| `consensus` | bitcoin, ethereum, bloch |
| `compare` | bitcoin, ethereum, bloch |
| `utxo` | bitcoin, bloch |
| `accounts` | ethereum |
| `fees` | bitcoin, ethereum, bloch |
| `finality` | bitcoin, ethereum, bloch |
| `features` | bloch |
| `block_details` | bitcoin, ethereum, bloch |
| `bitcoin_fee_rate` | bitcoin |
| `ethereum_receipts` | ethereum |
| `token_transfers` | ethereum |
| `validators` | ethereum, bloch |
| `mempool` | bitcoin, bloch |
| `reorgs` | bitcoin, ethereum, bloch |

### Explorer

| Topic | Networks |
| --- | --- |
| `blocks` | bloch |
| `transactions` | bloch |
| `eutxo` | bloch |
| `coverage` | bloch |
| `wallet_summary` | bloch |
| `transaction_analysis` | bloch |
| `graph_analysis` | bloch |
| `finality` | bloch |
| `features` | bloch |
| `health` | bloch |
| `fees` | bloch |
| `slot_epoch` | bloch |
| `validators` | bloch |
| `staking_lifecycle` | bloch |
| `output_references` | bloch |
| `fee_market` | bloch |
| `mempool` | bloch |
| `block_commitments` | bloch |
| `reorgs` | bloch |
| `upgrade_status` | bloch |

