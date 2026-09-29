// Curated chain references. Mirrored from BlochAI chain_knowledge.json.
export const KNOWLEDGE = {
  "graphus": {
    "purpose": "Interpret public chain graphs, address observations and transaction connections with source coverage.",
    "topics": {
      "connections": {
        "title": "Graph connections",
        "question": "How should I interpret the observed graph connections?",
        "keywords": [
          "connections",
          "connection",
          "conexoes",
          "conexao",
          "edges",
          "arestas",
          "neighbors",
          "vizinhos"
        ],
        "notes": [
          "Edges describe observed relationships between public records, not proven identity or common ownership.",
          "A graph is a bounded projection: omitted transactions, edges and sources remain unknown."
        ],
        "sources": [
          {
            "id": "graphus",
            "title": "Graphus public observations",
            "url": "https://bloch-graphus.xyz/"
          }
        ],
        "networks": [
          "bitcoin",
          "ethereum",
          "bloch"
        ],
        "reviewed_at": "2026-09-28"
      },
      "readings": {
        "title": "Read a graph",
        "question": "How should I read this public graph observation?",
        "keywords": [
          "readings",
          "reading",
          "interpret",
          "interpretar",
          "leitura",
          "ler grafo"
        ],
        "notes": [
          "Read the network, record type, anchor and collection time before interpreting a path.",
          "A path is descriptive evidence within the displayed sample; it is not an accusation or complete tracing history."
        ],
        "sources": [
          {
            "id": "graphus",
            "title": "Graphus public observations",
            "url": "https://bloch-graphus.xyz/"
          }
        ],
        "networks": [
          "bitcoin",
          "ethereum",
          "bloch"
        ],
        "reviewed_at": "2026-09-28"
      },
      "coverage": {
        "title": "Coverage and missing data",
        "question": "What can this source coverage establish, and what remains unknown?",
        "keywords": [
          "coverage",
          "cobertura",
          "missing",
          "ausente",
          "limitations",
          "limites",
          "completo"
        ],
        "notes": [
          "A source can return a partial or capped sample. Zero returned records and unavailable records are different states.",
          "Document omitted rows, source time and network before comparing snapshots."
        ],
        "sources": [
          {
            "id": "graphus",
            "title": "Graphus public observations",
            "url": "https://bloch-graphus.xyz/"
          },
          {
            "id": "space",
            "title": "Bloch Space public chain workspace",
            "url": "https://bloch.space/app/"
          }
        ],
        "networks": [
          "bitcoin",
          "ethereum",
          "bloch"
        ],
        "reviewed_at": "2026-09-28"
      },
      "wallet_summary": {
        "title": "Wallet/address analysis",
        "question": "Describe the supplied public address observation, balance and visible activity, including coverage limits.",
        "keywords": [
          "wallet",
          "wallets",
          "address",
          "addresses",
          "carteira",
          "carteiras",
          "endereco",
          "enderecos",
          "balance",
          "saldo"
        ],
        "notes": [
          "An address is a public identifier, not proof of a person or of the requester owning its keys.",
          "A reported balance belongs to the stated network, asset and observation point. Missing history cannot prove inactivity.",
          "Never request private keys or seed phrases. Explain only the supplied public evidence."
        ],
        "sources": [
          {
            "id": "btc_wallet",
            "title": "Bitcoin wallet and change handling",
            "url": "https://developer.bitcoin.org/devguide/wallets.html"
          },
          {
            "id": "eth_accounts",
            "title": "Ethereum account state",
            "url": "https://ethereum.org/developers/docs/accounts/"
          }
        ],
        "networks": [
          "bitcoin",
          "ethereum",
          "bloch"
        ],
        "reviewed_at": "2026-09-28"
      },
      "transaction_analysis": {
        "title": "Transaction analysis",
        "question": "Explain the supplied transaction evidence: inputs or sender, outputs or recipient, value, status and limits.",
        "keywords": [
          "transaction analysis",
          "analisar transacao",
          "analise transacao",
          "txid",
          "tx hash",
          "transaction hash",
          "hash transacao",
          "receipt",
          "recibo"
        ],
        "notes": [
          "Separate the transaction record, inclusion observation and finality observation. They are different evidence.",
          "Values must retain their asset and base unit. Missing receipt or history is unknown, not a failed transaction."
        ],
        "sources": [
          {
            "id": "btc_tx",
            "title": "Bitcoin transaction structure",
            "url": "https://developer.bitcoin.org/devguide/transactions.html"
          },
          {
            "id": "eth_tx",
            "title": "Ethereum transaction fields",
            "url": "https://ethereum.org/developers/docs/transactions/"
          }
        ],
        "networks": [
          "bitcoin",
          "ethereum",
          "bloch"
        ],
        "reviewed_at": "2026-09-28"
      },
      "graph_analysis": {
        "title": "Graphus analysis and export",
        "question": "Summarize the observed public graph structure and what the exported sample can support.",
        "keywords": [
          "graph analysis",
          "graphus",
          "grafo",
          "grafos",
          "graph",
          "graphs",
          "export",
          "exportar",
          "csv",
          "pdf"
        ],
        "notes": [
          "Graph nodes and edges come from a bounded public sample, not a full history or identity database.",
          "Export the source, observation time, sample limits and raw record identifiers alongside the descriptive analysis.",
          "A graph diagram is a layout of observed links; distance and position are visual choices, not evidence."
        ],
        "sources": [
          {
            "id": "graphus",
            "title": "Graphus public observations",
            "url": "https://bloch-graphus.xyz/"
          }
        ],
        "networks": [
          "bitcoin",
          "ethereum",
          "bloch"
        ],
        "reviewed_at": "2026-09-28"
      },
      "transactions": {
        "title": "Transaction records",
        "question": "What does a transaction record show on the selected chain?",
        "keywords": [
          "transactions",
          "transacoes",
          "transaction",
          "transacao",
          "transfer",
          "transferencia"
        ],
        "notes": [
          "Bitcoin and Bloch transaction records reference consumed and created outputs; Ethereum transaction records describe account-authorized execution.",
          "A transaction hash identifies a transaction, while a block hash identifies its containing block. Preserve the selected network and record type.",
          "Inclusion, execution status and finality are separate observations. An address or connection does not establish identity or payment purpose."
        ],
        "sources": [
          {
            "id": "space_adapter",
            "title": "Bloch Space public observation and transaction contracts",
            "url": "https://github.com/tiagobeltraoacioli-sketch/bloch-inc-porb/blob/42cac3e1bfda682ba7df92371eb26ac341d81ea6/space/chain/explorer.js"
          },
          {
            "id": "btc_tx",
            "title": "Bitcoin transaction structure",
            "url": "https://developer.bitcoin.org/devguide/transactions.html"
          },
          {
            "id": "eth_tx",
            "title": "Ethereum transaction fields",
            "url": "https://ethereum.org/developers/docs/transactions/"
          },
          {
            "id": "bloch_rpc",
            "title": "Bloch reviewed RPC field definitions",
            "url": "https://github.com/tiagobeltraoacioli-sketch/bloch-sis-pow/blob/35d8c3029e3c7ee5417502d6c2b728184dd17b0e/crates/bloch-pos-node/src/rpc.rs"
          }
        ],
        "networks": [
          "bitcoin",
          "ethereum",
          "bloch"
        ],
        "reviewed_at": "2026-09-28"
      },
      "utxo": {
        "title": "UTXO model",
        "question": "Explain Bitcoin inputs, outputs and UTXOs in a public observation.",
        "keywords": [
          "utxo",
          "unspent",
          "input",
          "output",
          "entradas",
          "saidas",
          "troco",
          "change output"
        ],
        "notes": [
          "An input points to a previous output identified by a transaction hash and output index. Unspent outputs and already spent references are different states.",
          "Bitcoin and Bloch apply their own spending rules. An output table or address balance does not describe every address controlled by a wallet.",
          "Do not assign an input amount to a particular output or infer common ownership from a shared transaction."
        ],
        "sources": [
          {
            "id": "graphus_network",
            "title": "Graphus bounded network adapter at the reviewed release",
            "url": "https://github.com/tiagobeltraoacioli-sketch/bloch-inc-porb/blob/42cac3e1bfda682ba7df92371eb26ac341d81ea6/graphus/chain/network-graph.js"
          },
          {
            "id": "btc_tx",
            "title": "Bitcoin transaction structure",
            "url": "https://developer.bitcoin.org/devguide/transactions.html"
          },
          {
            "id": "bloch_transition",
            "title": "Bloch reviewed state transition and output rules",
            "url": "https://github.com/tiagobeltraoacioli-sketch/bloch-sis-pow/blob/35d8c3029e3c7ee5417502d6c2b728184dd17b0e/crates/bloch-pos-committee/src/transition.rs"
          }
        ],
        "networks": [
          "bitcoin",
          "bloch"
        ],
        "reviewed_at": "2026-09-28"
      },
      "accounts": {
        "title": "Account model",
        "question": "Explain Ethereum accounts and how their state differs from a UTXO view.",
        "keywords": [
          "account model",
          "accounts",
          "contas",
          "nonce",
          "contract",
          "contrato",
          "smart contract"
        ],
        "notes": [
          "Ethereum distinguishes externally owned accounts from contract accounts.",
          "Account nonce and balance describe protocol state; they do not identify a person. Never infer all historical transfers from a balance lookup."
        ],
        "sources": [
          {
            "id": "eth_accounts",
            "title": "Ethereum account state",
            "url": "https://ethereum.org/developers/docs/accounts/"
          }
        ],
        "networks": [
          "ethereum"
        ],
        "reviewed_at": "2026-09-28"
      },
      "fees": {
        "title": "Fees and resource costs",
        "question": "How should I interpret fees and resource measurements on the selected chain?",
        "keywords": [
          "fees",
          "fee",
          "taxa",
          "taxas",
          "gas",
          "gwei",
          "satoshi",
          "sat/vb"
        ],
        "notes": [
          "Keep the fee amount, resource quantity and price per resource separate, retaining the exact asset and unit.",
          "Bitcoin satoshis and sat/vbyte differ. Ethereum gas used, price in wei per gas, and a transaction fee cap are different measurements.",
          "Bloch reports a millisatoshi-per-gas price and fees settled in satoshis. A source quote does not guarantee future inclusion or cost."
        ],
        "sources": [
          {
            "id": "space_adapter",
            "title": "Bloch Space public observation and transaction contracts",
            "url": "https://github.com/tiagobeltraoacioli-sketch/bloch-inc-porb/blob/42cac3e1bfda682ba7df92371eb26ac341d81ea6/space/chain/explorer.js"
          },
          {
            "id": "btc_weight",
            "title": "BIP141 transaction weight and virtual size",
            "url": "https://github.com/bitcoin/bips/blob/master/bip-0141.mediawiki"
          },
          {
            "id": "eth_gas",
            "title": "Ethereum gas and fee accounting",
            "url": "https://ethereum.org/developers/docs/gas/"
          },
          {
            "id": "bloch_fee",
            "title": "Bloch reviewed gas and fee arithmetic",
            "url": "https://github.com/tiagobeltraoacioli-sketch/bloch-sis-pow/blob/35d8c3029e3c7ee5417502d6c2b728184dd17b0e/crates/bloch-pos-committee/src/fee_market.rs"
          }
        ],
        "networks": [
          "bitcoin",
          "ethereum",
          "bloch"
        ],
        "reviewed_at": "2026-09-28"
      },
      "finality": {
        "title": "Confirmations and finality",
        "question": "How should I compare an observed head with confirmations or finalized checkpoints?",
        "keywords": [
          "finality",
          "finalidade",
          "finalizado",
          "finalized",
          "confirmation",
          "confirmacoes",
          "confirmacao",
          "reorg"
        ],
        "notes": [
          "A head observation and a finalized checkpoint describe different states.",
          "Bitcoin chainwork/confirmations and proof-of-stake checkpoint finality have different assumptions.",
          "For Bloch, report the returned height and slot separately; do not infer finality for a specific transaction without supporting evidence."
        ],
        "sources": [
          {
            "id": "btc_chain",
            "title": "Bitcoin chain selection and confirmations",
            "url": "https://developer.bitcoin.org/devguide/block_chain.html"
          },
          {
            "id": "eth_pos",
            "title": "Ethereum proof of stake and checkpoint finality",
            "url": "https://ethereum.org/developers/docs/consensus-mechanisms/pos/"
          },
          {
            "id": "explorer",
            "title": "Bloch public explorer",
            "url": "https://blochl1.com/"
          }
        ],
        "networks": [
          "bitcoin",
          "ethereum",
          "bloch"
        ],
        "reviewed_at": "2026-09-28"
      },
      "change_outputs": {
        "title": "Change and self-transfer limits",
        "question": "How can change outputs or self-transfers affect the interpretation of this Bitcoin graph?",
        "keywords": [
          "change",
          "troco",
          "self transfer",
          "autotransferencia",
          "consolidation",
          "consolidacao"
        ],
        "notes": [
          "A Bitcoin payment can spend an entire previous output and create a separate change output. One transaction can therefore contain both payment and change records.",
          "Do not label a particular output as change, or two references as the same owner, from this public graph alone.",
          "Summing every created output as external payment volume can include change or consolidation; a displayed total is not net value sent to other people."
        ],
        "sources": [
          {
            "id": "btc_wallet",
            "title": "Bitcoin wallet and change handling",
            "url": "https://developer.bitcoin.org/devguide/wallets.html"
          },
          {
            "id": "btc_tx",
            "title": "Bitcoin transaction structure",
            "url": "https://developer.bitcoin.org/devguide/transactions.html"
          },
          {
            "id": "graphus_network",
            "title": "Graphus bounded network adapter at the reviewed release",
            "url": "https://github.com/tiagobeltraoacioli-sketch/bloch-inc-porb/blob/42cac3e1bfda682ba7df92371eb26ac341d81ea6/graphus/chain/network-graph.js"
          }
        ],
        "networks": [
          "bitcoin"
        ],
        "reviewed_at": "2026-09-28"
      },
      "asset_units": {
        "title": "Exact asset units",
        "question": "How should exact amounts and asset units be preserved in this graph or export?",
        "keywords": [
          "units",
          "unidades",
          "decimals",
          "decimais",
          "base units",
          "wei",
          "satoshis"
        ],
        "notes": [
          "Keep the asset and network with every amount. Bitcoin uses satoshis, Ethereum native value uses wei, and Bloch source amounts use satoshi-denominated base units.",
          "Preserve integer base-unit strings in exports. Decimal formatting is presentation and must not introduce floating-point rounding.",
          "Token amounts require the specific contract and its declared decimal convention. A token symbol, balance or unit count does not establish a fiat price."
        ],
        "sources": [
          {
            "id": "space_adapter",
            "title": "Bloch Space public observation and transaction contracts",
            "url": "https://github.com/tiagobeltraoacioli-sketch/bloch-inc-porb/blob/42cac3e1bfda682ba7df92371eb26ac341d81ea6/space/chain/explorer.js"
          },
          {
            "id": "eth_tokens",
            "title": "Ethereum ERC20 token overview",
            "url": "https://ethereum.org/developers/docs/standards/tokens/erc-20/"
          },
          {
            "id": "bloch_rpc",
            "title": "Bloch reviewed RPC field definitions",
            "url": "https://github.com/tiagobeltraoacioli-sketch/bloch-sis-pow/blob/35d8c3029e3c7ee5417502d6c2b728184dd17b0e/crates/bloch-pos-node/src/rpc.rs"
          }
        ],
        "networks": [
          "bitcoin",
          "ethereum",
          "bloch"
        ],
        "reviewed_at": "2026-09-28"
      },
      "receipt_status": {
        "title": "Receipt and execution evidence",
        "question": "What can a matched Ethereum receipt establish about this transaction?",
        "keywords": [
          "receipt status",
          "status recibo",
          "execution",
          "execucao",
          "revert",
          "revertida",
          "failed"
        ],
        "notes": [
          "Match a receipt to its transaction hash, block hash and position before using its execution result. A transaction hash is not a block hash.",
          "A successful top-level receipt does not prove a user intended the outcome or that a contract is safe. Failed execution can still consume gas.",
          "A missing receipt is an unknown source state; it does not by itself distinguish pending, dropped or unavailable history."
        ],
        "sources": [
          {
            "id": "eth_rpc",
            "title": "Ethereum JSON-RPC transaction and receipt fields",
            "url": "https://ethereum.org/developers/docs/apis/json-rpc/"
          },
          {
            "id": "eth_receipt_status",
            "title": "EIP658 receipt execution status",
            "url": "https://github.com/ethereum/EIPs/blob/master/EIPS/eip-658.md"
          },
          {
            "id": "eth_gas",
            "title": "Ethereum gas and fee accounting",
            "url": "https://ethereum.org/developers/docs/gas/"
          }
        ],
        "networks": [
          "ethereum"
        ],
        "reviewed_at": "2026-09-28"
      },
      "token_events": {
        "title": "Token events and native value",
        "question": "How do ERC20 Transfer events differ from native ETH transaction value?",
        "keywords": [
          "token events",
          "eventos token",
          "erc20",
          "erc 20",
          "usdt",
          "usdc",
          "transfer log"
        ],
        "notes": [
          "ERC20 Transfer logs describe an event emitted by a specific contract. The transaction native-value field is an ETH amount, not the token amount.",
          "Identify the chain, contract, transaction hash and log index; keep integer token units until the matching decimal convention is known.",
          "One transaction may emit multiple events, including zero-value transfers. Event counts and transaction counts must not be treated as interchangeable."
        ],
        "sources": [
          {
            "id": "eth_erc20",
            "title": "ERC20 token balances, events and allowance",
            "url": "https://github.com/ethereum/ERCs/blob/master/ERCS/erc-20.md"
          },
          {
            "id": "eth_tokens",
            "title": "Ethereum ERC20 token overview",
            "url": "https://ethereum.org/developers/docs/standards/tokens/erc-20/"
          },
          {
            "id": "eth_rpc",
            "title": "Ethereum JSON-RPC transaction and receipt fields",
            "url": "https://ethereum.org/developers/docs/apis/json-rpc/"
          }
        ],
        "networks": [
          "ethereum"
        ],
        "reviewed_at": "2026-09-28"
      },
      "graph_paths": {
        "title": "Paths without ownership claims",
        "question": "What does a path through the observed graph establish, and what does it leave unknown?",
        "keywords": [
          "path",
          "paths",
          "caminho",
          "caminhos",
          "hops",
          "saltos",
          "flow",
          "fluxo"
        ],
        "notes": [
          "A path joins records that appear in this particular sample. Missing edges, source gaps and collection limits may hide other paths.",
          "A sequence of links does not prove that the same units of value travelled along the whole path, or that its references share an owner.",
          "Layout distance, node size and traversal depth are display choices unless a documented metric explicitly defines them."
        ],
        "sources": [
          {
            "id": "graphus_network",
            "title": "Graphus bounded network adapter at the reviewed release",
            "url": "https://github.com/tiagobeltraoacioli-sketch/bloch-inc-porb/blob/42cac3e1bfda682ba7df92371eb26ac341d81ea6/graphus/chain/network-graph.js"
          },
          {
            "id": "graphus_collection",
            "title": "Graphus observation and collection contract",
            "url": "https://github.com/tiagobeltraoacioli-sketch/bloch-inc-porb/blob/42cac3e1bfda682ba7df92371eb26ac341d81ea6/docs/graphus-real-network-feed.md"
          }
        ],
        "networks": [
          "bitcoin",
          "ethereum",
          "bloch"
        ],
        "reviewed_at": "2026-09-28"
      },
      "sampling_bias": {
        "title": "Sample selection and bias",
        "question": "How does the source selection rule limit a conclusion about this public graph?",
        "keywords": [
          "sampling",
          "amostragem",
          "sample bias",
          "vies amostra",
          "selection",
          "selecao",
          "population"
        ],
        "notes": [
          "A recent or first-record sample describes its selection window; it is not a random sample of the whole chain.",
          "Keep returned records, omitted records and the source denominator distinct. A sample share is not a network-wide market share or concentration measure.",
          "An earlier cursor page may move to another block without recovering every omitted transaction in the previous block."
        ],
        "sources": [
          {
            "id": "graphus_network",
            "title": "Graphus bounded network adapter at the reviewed release",
            "url": "https://github.com/tiagobeltraoacioli-sketch/bloch-inc-porb/blob/42cac3e1bfda682ba7df92371eb26ac341d81ea6/graphus/chain/network-graph.js"
          },
          {
            "id": "graphus_collection",
            "title": "Graphus observation and collection contract",
            "url": "https://github.com/tiagobeltraoacioli-sketch/bloch-inc-porb/blob/42cac3e1bfda682ba7df92371eb26ac341d81ea6/docs/graphus-real-network-feed.md"
          }
        ],
        "networks": [
          "bitcoin",
          "ethereum",
          "bloch"
        ],
        "reviewed_at": "2026-09-28"
      },
      "block_anchors": {
        "title": "Block anchors and snapshot identity",
        "question": "How should block hashes, heights and timestamps anchor this graph observation?",
        "keywords": [
          "anchor",
          "anchors",
          "ancora",
          "ancoras",
          "block hash",
          "hash bloco",
          "checkpoint"
        ],
        "notes": [
          "A height alone does not uniquely identify a block across reorganizations. Retain the network, block hash and source observation time.",
          "The time a source was queried and a timestamp inside a block describe different events. Neither is a proof of a payment purpose.",
          "Do not merge conflicting block hashes at one height into a single confirmed history; keep the disagreement explicit."
        ],
        "sources": [
          {
            "id": "graphus_network",
            "title": "Graphus bounded network adapter at the reviewed release",
            "url": "https://github.com/tiagobeltraoacioli-sketch/bloch-inc-porb/blob/42cac3e1bfda682ba7df92371eb26ac341d81ea6/graphus/chain/network-graph.js"
          },
          {
            "id": "btc_headers",
            "title": "Bitcoin block header fields",
            "url": "https://developer.bitcoin.org/reference/block_chain.html"
          },
          {
            "id": "eth_blocks",
            "title": "Ethereum execution and consensus block fields",
            "url": "https://ethereum.org/developers/docs/blocks/"
          }
        ],
        "networks": [
          "bitcoin",
          "ethereum",
          "bloch"
        ],
        "reviewed_at": "2026-09-28"
      },
      "duplicate_records": {
        "title": "Duplicate records and counting",
        "question": "How should duplicate records and transaction counts be handled in a graph export?",
        "keywords": [
          "duplicates",
          "duplicados",
          "deduplicate",
          "deduplicar",
          "double count",
          "contagem dupla",
          "event id"
        ],
        "notes": [
          "Repeated retrieval of the same event should not create an extra observation of value. Use network and event-level identifiers when merging samples.",
          "A transaction can have several outputs or logs. A transaction hash alone is not an event-level deduplication key.",
          "For output-based records, retain the outpoint and input/output direction; do not add both legs together as transfer volume."
        ],
        "sources": [
          {
            "id": "graphus_collection",
            "title": "Graphus observation and collection contract",
            "url": "https://github.com/tiagobeltraoacioli-sketch/bloch-inc-porb/blob/42cac3e1bfda682ba7df92371eb26ac341d81ea6/docs/graphus-real-network-feed.md"
          },
          {
            "id": "graphus_network",
            "title": "Graphus bounded network adapter at the reviewed release",
            "url": "https://github.com/tiagobeltraoacioli-sketch/bloch-inc-porb/blob/42cac3e1bfda682ba7df92371eb26ac341d81ea6/graphus/chain/network-graph.js"
          }
        ],
        "networks": [
          "bitcoin",
          "ethereum",
          "bloch"
        ],
        "reviewed_at": "2026-09-28"
      },
      "token_approvals": {
        "title": "Token approvals and allowances",
        "question": "How is an ERC20 approval different from a transfer or token balance?",
        "keywords": [
          "approval",
          "approvals",
          "aprovacao",
          "allowance",
          "allowances",
          "permissao token",
          "spender"
        ],
        "notes": [
          "An ERC20 approval concerns a spending allowance for a particular spender and contract. It is not itself a transfer or an increase in balance.",
          "An Approval event is historical evidence; the current allowance requires a state query at an identified block.",
          "This assistant must say when allowance data is absent. A transfer-only sample cannot prove that no approval exists or that access has been revoked."
        ],
        "sources": [
          {
            "id": "eth_erc20",
            "title": "ERC20 token balances, events and allowance",
            "url": "https://github.com/ethereum/ERCs/blob/master/ERCS/erc-20.md"
          },
          {
            "id": "eth_rpc",
            "title": "Ethereum JSON-RPC transaction and receipt fields",
            "url": "https://ethereum.org/developers/docs/apis/json-rpc/"
          }
        ],
        "networks": [
          "ethereum"
        ],
        "reviewed_at": "2026-09-28"
      }
    }
  },
  "space": {
    "purpose": "Research and compare public Bitcoin, Ethereum and Bloch observations, data models and source freshness.",
    "topics": {
      "observations": {
        "title": "Network observations",
        "question": "Summarize the supplied public observations of the selected network.",
        "keywords": [
          "observations",
          "observation",
          "network",
          "rede",
          "redes",
          "overview",
          "visao geral",
          "blockchain",
          "chains",
          "chain"
        ],
        "notes": [
          "Network, block height, slot and timestamp must be labelled explicitly.",
          "Only supplied observations are current evidence. Collection time and source coverage limit the conclusion."
        ],
        "sources": [
          {
            "id": "space",
            "title": "Bloch Space public chain workspace",
            "url": "https://bloch.space/app/"
          }
        ],
        "networks": [
          "bitcoin",
          "ethereum",
          "bloch"
        ],
        "reviewed_at": "2026-09-28"
      },
      "freshness": {
        "title": "Freshness and timestamps",
        "question": "How fresh is the supplied observation, and which timestamps should I compare?",
        "keywords": [
          "freshness",
          "fresh",
          "atualizado",
          "atualizacao",
          "recente",
          "timestamp",
          "tempo",
          "data"
        ],
        "notes": [
          "Collection time, source sample time and block time are different timestamps.",
          "A cached or delayed observation does not establish current state. Missing time information should be stated."
        ],
        "sources": [
          {
            "id": "space",
            "title": "Bloch Space public chain workspace",
            "url": "https://bloch.space/app/"
          }
        ],
        "networks": [
          "bitcoin",
          "ethereum",
          "bloch"
        ],
        "reviewed_at": "2026-09-28"
      },
      "coverage": {
        "title": "Coverage and missing data",
        "question": "What can this source coverage establish, and what remains unknown?",
        "keywords": [
          "coverage",
          "cobertura",
          "missing",
          "ausente",
          "limitations",
          "limites",
          "completo"
        ],
        "notes": [
          "A source can return a partial or capped sample. Zero returned records and unavailable records are different states.",
          "Document omitted rows, source time and network before comparing snapshots."
        ],
        "sources": [
          {
            "id": "graphus",
            "title": "Graphus public observations",
            "url": "https://bloch-graphus.xyz/"
          },
          {
            "id": "space",
            "title": "Bloch Space public chain workspace",
            "url": "https://bloch.space/app/"
          }
        ],
        "networks": [
          "bitcoin",
          "ethereum",
          "bloch"
        ],
        "reviewed_at": "2026-09-28"
      },
      "wallet_summary": {
        "title": "Wallet/address analysis",
        "question": "Describe the supplied public address observation, balance and visible activity, including coverage limits.",
        "keywords": [
          "wallet",
          "wallets",
          "address",
          "addresses",
          "carteira",
          "carteiras",
          "endereco",
          "enderecos",
          "balance",
          "saldo"
        ],
        "notes": [
          "An address is a public identifier, not proof of a person or of the requester owning its keys.",
          "A reported balance belongs to the stated network, asset and observation point. Missing history cannot prove inactivity.",
          "Never request private keys or seed phrases. Explain only the supplied public evidence."
        ],
        "sources": [
          {
            "id": "btc_wallet",
            "title": "Bitcoin wallet and change handling",
            "url": "https://developer.bitcoin.org/devguide/wallets.html"
          },
          {
            "id": "eth_accounts",
            "title": "Ethereum account state",
            "url": "https://ethereum.org/developers/docs/accounts/"
          }
        ],
        "networks": [
          "bitcoin",
          "ethereum",
          "bloch"
        ],
        "reviewed_at": "2026-09-28"
      },
      "transaction_analysis": {
        "title": "Transaction analysis",
        "question": "Explain the supplied transaction evidence: inputs or sender, outputs or recipient, value, status and limits.",
        "keywords": [
          "transaction analysis",
          "analisar transacao",
          "analise transacao",
          "txid",
          "tx hash",
          "transaction hash",
          "hash transacao",
          "receipt",
          "recibo"
        ],
        "notes": [
          "Separate the transaction record, inclusion observation and finality observation. They are different evidence.",
          "Values must retain their asset and base unit. Missing receipt or history is unknown, not a failed transaction."
        ],
        "sources": [
          {
            "id": "btc_tx",
            "title": "Bitcoin transaction structure",
            "url": "https://developer.bitcoin.org/devguide/transactions.html"
          },
          {
            "id": "eth_tx",
            "title": "Ethereum transaction fields",
            "url": "https://ethereum.org/developers/docs/transactions/"
          }
        ],
        "networks": [
          "bitcoin",
          "ethereum",
          "bloch"
        ],
        "reviewed_at": "2026-09-28"
      },
      "graph_analysis": {
        "title": "Graphus analysis and export",
        "question": "Summarize the observed public graph structure and what the exported sample can support.",
        "keywords": [
          "graph analysis",
          "graphus",
          "grafo",
          "grafos",
          "graph",
          "graphs",
          "export",
          "exportar",
          "csv",
          "pdf"
        ],
        "notes": [
          "Graph nodes and edges come from a bounded public sample, not a full history or identity database.",
          "Export the source, observation time, sample limits and raw record identifiers alongside the descriptive analysis.",
          "A graph diagram is a layout of observed links; distance and position are visual choices, not evidence."
        ],
        "sources": [
          {
            "id": "graphus",
            "title": "Graphus public observations",
            "url": "https://bloch-graphus.xyz/"
          }
        ],
        "networks": [
          "bitcoin",
          "ethereum",
          "bloch"
        ],
        "reviewed_at": "2026-09-28"
      },
      "consensus": {
        "title": "Consensus concepts",
        "question": "Explain consensus concepts relevant to the selected network without claiming a security audit.",
        "keywords": [
          "consensus",
          "consenso",
          "proof of work",
          "proof of stake",
          "pow",
          "pos",
          "mining",
          "mineracao",
          "staking"
        ],
        "notes": [
          "Bitcoin uses proof of work; Ethereum uses proof of stake. Their fork-choice and finality rules differ.",
          "A visible network observation does not independently prove consensus safety, decentralization or an audit result."
        ],
        "sources": [
          {
            "id": "btc_chain",
            "title": "Bitcoin chain selection and confirmations",
            "url": "https://developer.bitcoin.org/devguide/block_chain.html"
          },
          {
            "id": "eth_pos",
            "title": "Ethereum proof of stake and checkpoint finality",
            "url": "https://ethereum.org/developers/docs/consensus-mechanisms/pos/"
          }
        ],
        "networks": [
          "bitcoin",
          "ethereum",
          "bloch"
        ],
        "reviewed_at": "2026-09-28"
      },
      "compare": {
        "title": "Compare chain observations",
        "question": "Compare the data models and observation limits of Bitcoin, Ethereum and Bloch.",
        "keywords": [
          "compare",
          "comparison",
          "comparar",
          "comparacao",
          "difference",
          "diferenca",
          "bitcoin ethereum"
        ],
        "notes": [
          "Compare equivalent fields and units; a block height from one network is not comparable progress on another.",
          "Bitcoin UTXOs, Ethereum account state and Bloch explorer projections must keep their own source and coverage."
        ],
        "sources": [
          {
            "id": "space",
            "title": "Bloch Space public chain workspace",
            "url": "https://bloch.space/app/"
          }
        ],
        "networks": [
          "bitcoin",
          "ethereum",
          "bloch"
        ],
        "reviewed_at": "2026-09-28"
      },
      "utxo": {
        "title": "UTXO model",
        "question": "Explain Bitcoin inputs, outputs and UTXOs in a public observation.",
        "keywords": [
          "utxo",
          "unspent",
          "input",
          "output",
          "entradas",
          "saidas",
          "troco",
          "change output"
        ],
        "notes": [
          "An input points to a previous output identified by a transaction hash and output index. Unspent outputs and already spent references are different states.",
          "Bitcoin and Bloch apply their own spending rules. An output table or address balance does not describe every address controlled by a wallet.",
          "Do not assign an input amount to a particular output or infer common ownership from a shared transaction."
        ],
        "sources": [
          {
            "id": "graphus_network",
            "title": "Graphus bounded network adapter at the reviewed release",
            "url": "https://github.com/tiagobeltraoacioli-sketch/bloch-inc-porb/blob/42cac3e1bfda682ba7df92371eb26ac341d81ea6/graphus/chain/network-graph.js"
          },
          {
            "id": "btc_tx",
            "title": "Bitcoin transaction structure",
            "url": "https://developer.bitcoin.org/devguide/transactions.html"
          },
          {
            "id": "bloch_transition",
            "title": "Bloch reviewed state transition and output rules",
            "url": "https://github.com/tiagobeltraoacioli-sketch/bloch-sis-pow/blob/35d8c3029e3c7ee5417502d6c2b728184dd17b0e/crates/bloch-pos-committee/src/transition.rs"
          }
        ],
        "networks": [
          "bitcoin",
          "bloch"
        ],
        "reviewed_at": "2026-09-28"
      },
      "accounts": {
        "title": "Account model",
        "question": "Explain Ethereum accounts and how their state differs from a UTXO view.",
        "keywords": [
          "account model",
          "accounts",
          "contas",
          "nonce",
          "contract",
          "contrato",
          "smart contract"
        ],
        "notes": [
          "Ethereum distinguishes externally owned accounts from contract accounts.",
          "Account nonce and balance describe protocol state; they do not identify a person. Never infer all historical transfers from a balance lookup."
        ],
        "sources": [
          {
            "id": "eth_accounts",
            "title": "Ethereum account state",
            "url": "https://ethereum.org/developers/docs/accounts/"
          }
        ],
        "networks": [
          "ethereum"
        ],
        "reviewed_at": "2026-09-28"
      },
      "fees": {
        "title": "Fees and resource costs",
        "question": "How should I interpret fees and resource measurements on the selected chain?",
        "keywords": [
          "fees",
          "fee",
          "taxa",
          "taxas",
          "gas",
          "gwei",
          "satoshi",
          "sat/vb"
        ],
        "notes": [
          "Keep the fee amount, resource quantity and price per resource separate, retaining the exact asset and unit.",
          "Bitcoin satoshis and sat/vbyte differ. Ethereum gas used, price in wei per gas, and a transaction fee cap are different measurements.",
          "Bloch reports a millisatoshi-per-gas price and fees settled in satoshis. A source quote does not guarantee future inclusion or cost."
        ],
        "sources": [
          {
            "id": "space_adapter",
            "title": "Bloch Space public observation and transaction contracts",
            "url": "https://github.com/tiagobeltraoacioli-sketch/bloch-inc-porb/blob/42cac3e1bfda682ba7df92371eb26ac341d81ea6/space/chain/explorer.js"
          },
          {
            "id": "btc_weight",
            "title": "BIP141 transaction weight and virtual size",
            "url": "https://github.com/bitcoin/bips/blob/master/bip-0141.mediawiki"
          },
          {
            "id": "eth_gas",
            "title": "Ethereum gas and fee accounting",
            "url": "https://ethereum.org/developers/docs/gas/"
          },
          {
            "id": "bloch_fee",
            "title": "Bloch reviewed gas and fee arithmetic",
            "url": "https://github.com/tiagobeltraoacioli-sketch/bloch-sis-pow/blob/35d8c3029e3c7ee5417502d6c2b728184dd17b0e/crates/bloch-pos-committee/src/fee_market.rs"
          }
        ],
        "networks": [
          "bitcoin",
          "ethereum",
          "bloch"
        ],
        "reviewed_at": "2026-09-28"
      },
      "finality": {
        "title": "Confirmations and finality",
        "question": "How should I compare an observed head with confirmations or finalized checkpoints?",
        "keywords": [
          "finality",
          "finalidade",
          "finalizado",
          "finalized",
          "confirmation",
          "confirmacoes",
          "confirmacao",
          "reorg"
        ],
        "notes": [
          "A head observation and a finalized checkpoint describe different states.",
          "Bitcoin chainwork/confirmations and proof-of-stake checkpoint finality have different assumptions.",
          "For Bloch, report the returned height and slot separately; do not infer finality for a specific transaction without supporting evidence."
        ],
        "sources": [
          {
            "id": "btc_chain",
            "title": "Bitcoin chain selection and confirmations",
            "url": "https://developer.bitcoin.org/devguide/block_chain.html"
          },
          {
            "id": "eth_pos",
            "title": "Ethereum proof of stake and checkpoint finality",
            "url": "https://ethereum.org/developers/docs/consensus-mechanisms/pos/"
          },
          {
            "id": "explorer",
            "title": "Bloch public explorer",
            "url": "https://blochl1.com/"
          }
        ],
        "networks": [
          "bitcoin",
          "ethereum",
          "bloch"
        ],
        "reviewed_at": "2026-09-28"
      },
      "features": {
        "title": "Bloch features and evidence",
        "question": "How should I assess Bloch features and their activation evidence?",
        "keywords": [
          "features",
          "feature",
          "funcionalidades",
          "funcionalidade",
          "recursos",
          "recurso",
          "post quantum",
          "quantum",
          "pos quantica",
          "genesis"
        ],
        "notes": [
          "Use versioned protocol documentation and runtime observations to establish feature status.",
          "A repository name, roadmap or legacy implementation does not prove that a feature is enabled on the current network.",
          "State what the supplied source demonstrates and which activation evidence is absent; do not claim an external audit or compatibility without it."
        ],
        "sources": [
          {
            "id": "bloch_reference",
            "title": "Bloch reviewed protocol and capability reference",
            "url": "https://github.com/tiagobeltraoacioli-sketch/bloch-sis-pow/blob/35d8c3029e3c7ee5417502d6c2b728184dd17b0e/README.md"
          },
          {
            "id": "bloch_params",
            "title": "Bloch reviewed epoch and activation parameters",
            "url": "https://github.com/tiagobeltraoacioli-sketch/bloch-sis-pow/blob/35d8c3029e3c7ee5417502d6c2b728184dd17b0e/crates/bloch-pos-committee/src/params.rs"
          },
          {
            "id": "explorer",
            "title": "Bloch public explorer",
            "url": "https://blochl1.com/"
          }
        ],
        "networks": [
          "bloch"
        ],
        "reviewed_at": "2026-09-28"
      },
      "block_details": {
        "title": "Block fields and resource use",
        "question": "Which block fields should be compared without confusing consensus and execution records?",
        "keywords": [
          "block details",
          "detalhes bloco",
          "header",
          "cabecalho",
          "gas used",
          "block size",
          "tamanho bloco"
        ],
        "notes": [
          "Read the network and record type first. Block height, block hash, slot and transaction hash have different meanings.",
          "Bitcoin header and size fields, Ethereum execution gas fields, and Bloch height/slot fields are different measurements; equal numbers are not equivalent capacity.",
          "A source-reported block does not independently verify its signatures, transactions or current canonical membership."
        ],
        "sources": [
          {
            "id": "space_adapter",
            "title": "Bloch Space public observation and transaction contracts",
            "url": "https://github.com/tiagobeltraoacioli-sketch/bloch-inc-porb/blob/42cac3e1bfda682ba7df92371eb26ac341d81ea6/space/chain/explorer.js"
          },
          {
            "id": "btc_headers",
            "title": "Bitcoin block header fields",
            "url": "https://developer.bitcoin.org/reference/block_chain.html"
          },
          {
            "id": "eth_blocks",
            "title": "Ethereum execution and consensus block fields",
            "url": "https://ethereum.org/developers/docs/blocks/"
          },
          {
            "id": "bloch_rpc",
            "title": "Bloch reviewed RPC field definitions",
            "url": "https://github.com/tiagobeltraoacioli-sketch/bloch-sis-pow/blob/35d8c3029e3c7ee5417502d6c2b728184dd17b0e/crates/bloch-pos-node/src/rpc.rs"
          }
        ],
        "networks": [
          "bitcoin",
          "ethereum",
          "bloch"
        ],
        "reviewed_at": "2026-09-28"
      },
      "bitcoin_fee_rate": {
        "title": "Bitcoin fee rate and weight",
        "question": "How do Bitcoin transaction fees, weight and virtual size relate to source fee estimates?",
        "keywords": [
          "bitcoin fee",
          "taxa bitcoin",
          "feerate",
          "fee rate",
          "sat/vbyte",
          "peso",
          "vsize",
          "virtual size"
        ],
        "notes": [
          "The transaction fee is an amount in satoshis. A fee rate divides that amount by a resource measure such as virtual bytes.",
          "For SegWit accounting, virtual size is transaction weight divided by four and rounded upward. Serialized bytes and virtual bytes need not match.",
          "An estimate or node relay threshold is a current policy observation, not a promise of confirmation in a chosen number of blocks."
        ],
        "sources": [
          {
            "id": "btc_weight",
            "title": "BIP141 transaction weight and virtual size",
            "url": "https://github.com/bitcoin/bips/blob/master/bip-0141.mediawiki"
          },
          {
            "id": "btc_mempool",
            "title": "Bitcoin node mempool measurements",
            "url": "https://developer.bitcoin.org/reference/rpc/getmempoolinfo.html"
          },
          {
            "id": "btc_payment",
            "title": "Bitcoin payment and confirmation observations",
            "url": "https://developer.bitcoin.org/devguide/payment_processing.html"
          }
        ],
        "networks": [
          "bitcoin"
        ],
        "reviewed_at": "2026-09-28"
      },
      "ethereum_receipts": {
        "title": "Ethereum receipts and paid fees",
        "question": "How should execution status and paid Ethereum fees be read from a matched receipt?",
        "keywords": [
          "ethereum receipt",
          "recibo ethereum",
          "gas used",
          "effective gas price",
          "fee cap",
          "taxa paga",
          "execution status"
        ],
        "notes": [
          "Use a matched receipt for execution status and gas consumed. The transaction gas limit and maximum fee fields describe bounds, not the amount actually paid.",
          "Execution gas cost uses gas consumed and effective gas price. Blob-carrying transactions can have a separate blob fee component, so execution gas alone may not be the total.",
          "Execution success and checkpoint finality answer different questions. Missing receipt fields must remain unknown rather than becoming zero fees or failed execution."
        ],
        "sources": [
          {
            "id": "eth_gas",
            "title": "Ethereum gas and fee accounting",
            "url": "https://ethereum.org/developers/docs/gas/"
          },
          {
            "id": "eth_rpc",
            "title": "Ethereum JSON-RPC transaction and receipt fields",
            "url": "https://ethereum.org/developers/docs/apis/json-rpc/"
          },
          {
            "id": "eth_receipt_status",
            "title": "EIP658 receipt execution status",
            "url": "https://github.com/ethereum/EIPs/blob/master/EIPS/eip-658.md"
          }
        ],
        "networks": [
          "ethereum"
        ],
        "reviewed_at": "2026-09-28"
      },
      "token_transfers": {
        "title": "ERC20 balances and transfer logs",
        "question": "How should token balances and bounded transfer-log samples be interpreted?",
        "keywords": [
          "token balance",
          "saldo token",
          "token transfers",
          "transferencias token",
          "erc20",
          "usdc",
          "usdt"
        ],
        "notes": [
          "A token balance is contract state at a selected block. Transfer logs are event observations over a time or block window; they are not the same dataset.",
          "Keep chain and contract identity beside amounts. Names and symbols can be reused, and native ETH value is not a token transfer amount.",
          "A bounded event window can miss earlier activity. It cannot reconstruct a complete balance history or establish who controls an account."
        ],
        "sources": [
          {
            "id": "eth_tokens",
            "title": "Ethereum ERC20 token overview",
            "url": "https://ethereum.org/developers/docs/standards/tokens/erc-20/"
          },
          {
            "id": "eth_erc20",
            "title": "ERC20 token balances, events and allowance",
            "url": "https://github.com/ethereum/ERCs/blob/master/ERCS/erc-20.md"
          },
          {
            "id": "space_adapter",
            "title": "Bloch Space public observation and transaction contracts",
            "url": "https://github.com/tiagobeltraoacioli-sketch/bloch-inc-porb/blob/42cac3e1bfda682ba7df92371eb26ac341d81ea6/space/chain/explorer.js"
          }
        ],
        "networks": [
          "ethereum"
        ],
        "reviewed_at": "2026-09-28"
      },
      "validators": {
        "title": "Validator observations and stake",
        "question": "How should validator counts, stake and lifecycle observations be compared?",
        "keywords": [
          "validator",
          "validators",
          "validador",
          "validadores",
          "staking",
          "stake",
          "active stake",
          "ativos"
        ],
        "notes": [
          "Registry totals, active validators and effective stake describe different protocol quantities. A validator count does not count independent operators.",
          "Ethereum validator participation, rewards and penalties follow its own consensus rules. Do not copy Ethereum lifecycle parameters onto Bloch.",
          "For Bloch, combine source timestamps with versioned activation evidence before asserting that admission, exit or withdrawal is enabled. No validator count proves a reward rate."
        ],
        "sources": [
          {
            "id": "space_adapter",
            "title": "Bloch Space public observation and transaction contracts",
            "url": "https://github.com/tiagobeltraoacioli-sketch/bloch-inc-porb/blob/42cac3e1bfda682ba7df92371eb26ac341d81ea6/space/chain/explorer.js"
          },
          {
            "id": "eth_rewards",
            "title": "Ethereum validator rewards and penalties",
            "url": "https://ethereum.org/developers/docs/consensus-mechanisms/pos/rewards-and-penalties/"
          },
          {
            "id": "bloch_admission",
            "title": "Bloch funded-validator admission and release boundaries",
            "url": "https://github.com/tiagobeltraoacioli-sketch/bloch-sis-pow/blob/35d8c3029e3c7ee5417502d6c2b728184dd17b0e/docs/specs/BLOCH-FUNDED-VALIDATOR-ADMISSION.md"
          },
          {
            "id": "bloch_params",
            "title": "Bloch reviewed epoch and activation parameters",
            "url": "https://github.com/tiagobeltraoacioli-sketch/bloch-sis-pow/blob/35d8c3029e3c7ee5417502d6c2b728184dd17b0e/crates/bloch-pos-committee/src/params.rs"
          }
        ],
        "networks": [
          "ethereum",
          "bloch"
        ],
        "reviewed_at": "2026-09-28"
      },
      "mempool": {
        "title": "Mempool and pending observations",
        "question": "What can a source mempool snapshot establish about pending activity?",
        "keywords": [
          "mempool",
          "pending",
          "pendente",
          "pending transactions",
          "fila",
          "congestion",
          "congestao"
        ],
        "notes": [
          "A mempool is a particular node's current set of accepted pending transactions. Different nodes can report different sets or retrieval times.",
          "Pending counts, bytes and price quotes are not confirmed transaction throughput and do not guarantee eventual inclusion.",
          "Keep an empty reported mempool separate from an unavailable source; do not infer network-wide inactivity from either."
        ],
        "sources": [
          {
            "id": "space_adapter",
            "title": "Bloch Space public observation and transaction contracts",
            "url": "https://github.com/tiagobeltraoacioli-sketch/bloch-inc-porb/blob/42cac3e1bfda682ba7df92371eb26ac341d81ea6/space/chain/explorer.js"
          },
          {
            "id": "btc_mempool",
            "title": "Bitcoin node mempool measurements",
            "url": "https://developer.bitcoin.org/reference/rpc/getmempoolinfo.html"
          },
          {
            "id": "bloch_rpc",
            "title": "Bloch reviewed RPC field definitions",
            "url": "https://github.com/tiagobeltraoacioli-sketch/bloch-sis-pow/blob/35d8c3029e3c7ee5417502d6c2b728184dd17b0e/crates/bloch-pos-node/src/rpc.rs"
          }
        ],
        "networks": [
          "bitcoin",
          "bloch"
        ],
        "reviewed_at": "2026-09-28"
      },
      "reorgs": {
        "title": "Reorganizations and conflicting snapshots",
        "question": "How should reorganizations or conflicting source block hashes be handled?",
        "keywords": [
          "reorg",
          "reorgs",
          "reorganization",
          "reorganizacao",
          "fork",
          "canonical",
          "canonico"
        ],
        "notes": [
          "A reorganization changes which competing branch a node treats as canonical. A previously observed inclusion can therefore need rechecking.",
          "Compare block hashes and parent relationships, not only heights, and preserve the time and source of each observation.",
          "Do not silently combine conflicting records or describe a recent head as finalized. Apply the selected chain's confirmation or checkpoint semantics."
        ],
        "sources": [
          {
            "id": "space_adapter",
            "title": "Bloch Space public observation and transaction contracts",
            "url": "https://github.com/tiagobeltraoacioli-sketch/bloch-inc-porb/blob/42cac3e1bfda682ba7df92371eb26ac341d81ea6/space/chain/explorer.js"
          },
          {
            "id": "btc_chain",
            "title": "Bitcoin chain selection and confirmations",
            "url": "https://developer.bitcoin.org/devguide/block_chain.html"
          },
          {
            "id": "eth_pos",
            "title": "Ethereum proof of stake and checkpoint finality",
            "url": "https://ethereum.org/developers/docs/consensus-mechanisms/pos/"
          },
          {
            "id": "bloch_finality",
            "title": "Bloch reviewed checkpoint finality implementation",
            "url": "https://github.com/tiagobeltraoacioli-sketch/bloch-sis-pow/blob/35d8c3029e3c7ee5417502d6c2b728184dd17b0e/crates/bloch-pos-committee/src/finality.rs"
          }
        ],
        "networks": [
          "bitcoin",
          "ethereum",
          "bloch"
        ],
        "reviewed_at": "2026-09-28"
      }
    }
  },
  "explorer": {
    "purpose": "Understand public Bloch blocks, transactions, addresses, feature evidence and indexer coverage.",
    "topics": {
      "blocks": {
        "title": "Block records",
        "question": "What does a block represent, and how should I read its public record?",
        "keywords": [
          "block",
          "blocks",
          "bloco",
          "blocos",
          "height",
          "altura",
          "slot"
        ],
        "notes": [
          "A Bloch block has a block identifier and height, and is proposed at a slot. A transaction identifier names a different object.",
          "Slots can pass without a block. A slot number is not a count of produced blocks, and the head is not automatically the finalized checkpoint.",
          "Read parent, state/body commitments and source time together; a displayed header alone is not an independent replay of its state transition."
        ],
        "sources": [
          {
            "id": "bloch_rpc",
            "title": "Bloch reviewed RPC field definitions",
            "url": "https://github.com/tiagobeltraoacioli-sketch/bloch-sis-pow/blob/35d8c3029e3c7ee5417502d6c2b728184dd17b0e/crates/bloch-pos-node/src/rpc.rs"
          },
          {
            "id": "bloch_params",
            "title": "Bloch reviewed epoch and activation parameters",
            "url": "https://github.com/tiagobeltraoacioli-sketch/bloch-sis-pow/blob/35d8c3029e3c7ee5417502d6c2b728184dd17b0e/crates/bloch-pos-committee/src/params.rs"
          }
        ],
        "networks": [
          "bloch"
        ],
        "reviewed_at": "2026-09-28"
      },
      "transactions": {
        "title": "Transaction records",
        "question": "What does a transaction record show on the selected chain?",
        "keywords": [
          "transactions",
          "transacoes",
          "transaction",
          "transacao",
          "transfer",
          "transferencia"
        ],
        "notes": [
          "Bloch output records are referenced by transaction identifier and output index. A transaction may consume inputs and create several outputs under the active protocol rules.",
          "Preserve input and output directions separately. Neither a script hash nor a shared transaction proves a person, common ownership or payment purpose.",
          "An indexer record, its containing block and a later finalized checkpoint are different observations."
        ],
        "sources": [
          {
            "id": "bloch_transition",
            "title": "Bloch reviewed state transition and output rules",
            "url": "https://github.com/tiagobeltraoacioli-sketch/bloch-sis-pow/blob/35d8c3029e3c7ee5417502d6c2b728184dd17b0e/crates/bloch-pos-committee/src/transition.rs"
          },
          {
            "id": "bloch_rpc",
            "title": "Bloch reviewed RPC field definitions",
            "url": "https://github.com/tiagobeltraoacioli-sketch/bloch-sis-pow/blob/35d8c3029e3c7ee5417502d6c2b728184dd17b0e/crates/bloch-pos-node/src/rpc.rs"
          },
          {
            "id": "graphus_bloch",
            "title": "Graphus Bloch script-history adapter at the reviewed release",
            "url": "https://github.com/tiagobeltraoacioli-sketch/bloch-inc-porb/blob/42cac3e1bfda682ba7df92371eb26ac341d81ea6/graphus/chain/bloch-chain.js"
          }
        ],
        "networks": [
          "bloch"
        ],
        "reviewed_at": "2026-09-28"
      },
      "eutxo": {
        "title": "eUTXO and activation",
        "question": "Explain eUTXO concepts while distinguishing source-code capability from live-chain activation.",
        "keywords": [
          "eutxo",
          "extended utxo",
          "vm",
          "virtual machine",
          "maquina virtual"
        ],
        "notes": [
          "The reviewed Bloch reference distinguishes output-based ledger records from the legacy extended-UTXO virtual machine. The two labels are not interchangeable proof of capability.",
          "Source code, compiled capability, consensus wiring and deployment activation are separate evidence. Check the referenced revision and observed runtime before claiming VM support.",
          "A public unspent-output lookup establishes a source observation about that output, not that a particular script engine is active or independently audited."
        ],
        "sources": [
          {
            "id": "bloch_reference",
            "title": "Bloch reviewed protocol and capability reference",
            "url": "https://github.com/tiagobeltraoacioli-sketch/bloch-sis-pow/blob/35d8c3029e3c7ee5417502d6c2b728184dd17b0e/README.md"
          },
          {
            "id": "bloch_transition",
            "title": "Bloch reviewed state transition and output rules",
            "url": "https://github.com/tiagobeltraoacioli-sketch/bloch-sis-pow/blob/35d8c3029e3c7ee5417502d6c2b728184dd17b0e/crates/bloch-pos-committee/src/transition.rs"
          },
          {
            "id": "bloch_rpc",
            "title": "Bloch reviewed RPC field definitions",
            "url": "https://github.com/tiagobeltraoacioli-sketch/bloch-sis-pow/blob/35d8c3029e3c7ee5417502d6c2b728184dd17b0e/crates/bloch-pos-node/src/rpc.rs"
          }
        ],
        "networks": [
          "bloch"
        ],
        "reviewed_at": "2026-09-28"
      },
      "coverage": {
        "title": "Coverage and missing data",
        "question": "What can this source coverage establish, and what remains unknown?",
        "keywords": [
          "coverage",
          "cobertura",
          "missing",
          "ausente",
          "limitations",
          "limites",
          "completo"
        ],
        "notes": [
          "Bloch network head, indexer health and script history can be separate snapshots. Preserve indexed height, slot, retrieval time and any missing-source state.",
          "A capped history page or unavailable record is not a complete transaction history and does not establish that an arbitrary script hash was never used."
        ],
        "sources": [
          {
            "id": "graphus_bloch",
            "title": "Graphus Bloch script-history adapter at the reviewed release",
            "url": "https://github.com/tiagobeltraoacioli-sketch/bloch-inc-porb/blob/42cac3e1bfda682ba7df92371eb26ac341d81ea6/graphus/chain/bloch-chain.js"
          },
          {
            "id": "bloch_rpc",
            "title": "Bloch reviewed RPC field definitions",
            "url": "https://github.com/tiagobeltraoacioli-sketch/bloch-sis-pow/blob/35d8c3029e3c7ee5417502d6c2b728184dd17b0e/crates/bloch-pos-node/src/rpc.rs"
          }
        ],
        "networks": [
          "bloch"
        ],
        "reviewed_at": "2026-09-28"
      },
      "wallet_summary": {
        "title": "Wallet/address analysis",
        "question": "Describe the supplied public address observation, balance and visible activity, including coverage limits.",
        "keywords": [
          "wallet",
          "wallets",
          "address",
          "addresses",
          "carteira",
          "carteiras",
          "endereco",
          "enderecos",
          "balance",
          "saldo"
        ],
        "notes": [
          "The public Bloch lookup uses a 32-byte script hash. It is a ledger reference, not proof of a person or of the requester owning keys.",
          "The reported balance and a bounded script-history page may come from separate observations. Missing history cannot prove inactivity.",
          "Keep satoshi-denominated amounts exact and retain the source slot or height when available. Never provide private keys or seed phrases to this assistant."
        ],
        "sources": [
          {
            "id": "graphus_bloch",
            "title": "Graphus Bloch script-history adapter at the reviewed release",
            "url": "https://github.com/tiagobeltraoacioli-sketch/bloch-inc-porb/blob/42cac3e1bfda682ba7df92371eb26ac341d81ea6/graphus/chain/bloch-chain.js"
          },
          {
            "id": "bloch_rpc",
            "title": "Bloch reviewed RPC field definitions",
            "url": "https://github.com/tiagobeltraoacioli-sketch/bloch-sis-pow/blob/35d8c3029e3c7ee5417502d6c2b728184dd17b0e/crates/bloch-pos-node/src/rpc.rs"
          }
        ],
        "networks": [
          "bloch"
        ],
        "reviewed_at": "2026-09-28"
      },
      "transaction_analysis": {
        "title": "Transaction analysis",
        "question": "Explain the supplied transaction evidence: inputs or sender, outputs or recipient, value, status and limits.",
        "keywords": [
          "transaction analysis",
          "analisar transacao",
          "analise transacao",
          "txid",
          "tx hash",
          "transaction hash",
          "hash transacao",
          "receipt",
          "recibo"
        ],
        "notes": [
          "Read Bloch transaction inputs, created outputs, fees, height and slot as distinct fields. A transaction hash is not a block hash.",
          "Compare inclusion with a separately reported finalized checkpoint only when the source provides the relevant anchor. Unknown finality remains unknown.",
          "An input reference does not prove ownership, and summing input and output legs together does not measure transferred value."
        ],
        "sources": [
          {
            "id": "graphus_bloch",
            "title": "Graphus Bloch script-history adapter at the reviewed release",
            "url": "https://github.com/tiagobeltraoacioli-sketch/bloch-inc-porb/blob/42cac3e1bfda682ba7df92371eb26ac341d81ea6/graphus/chain/bloch-chain.js"
          },
          {
            "id": "bloch_rpc",
            "title": "Bloch reviewed RPC field definitions",
            "url": "https://github.com/tiagobeltraoacioli-sketch/bloch-sis-pow/blob/35d8c3029e3c7ee5417502d6c2b728184dd17b0e/crates/bloch-pos-node/src/rpc.rs"
          },
          {
            "id": "bloch_transition",
            "title": "Bloch reviewed state transition and output rules",
            "url": "https://github.com/tiagobeltraoacioli-sketch/bloch-sis-pow/blob/35d8c3029e3c7ee5417502d6c2b728184dd17b0e/crates/bloch-pos-committee/src/transition.rs"
          }
        ],
        "networks": [
          "bloch"
        ],
        "reviewed_at": "2026-09-28"
      },
      "graph_analysis": {
        "title": "Graphus analysis and export",
        "question": "Summarize the observed public graph structure and what the exported sample can support.",
        "keywords": [
          "graph analysis",
          "graphus",
          "grafo",
          "grafos",
          "graph",
          "graphs",
          "export",
          "exportar",
          "csv",
          "pdf"
        ],
        "notes": [
          "Graph nodes and edges come from a bounded public sample, not a full history or identity database.",
          "Export the source, observation time, sample limits and raw record identifiers alongside the descriptive analysis.",
          "A graph diagram is a layout of observed links; distance and position are visual choices, not evidence."
        ],
        "sources": [
          {
            "id": "graphus",
            "title": "Graphus public observations",
            "url": "https://bloch-graphus.xyz/"
          }
        ],
        "networks": [
          "bloch"
        ],
        "reviewed_at": "2026-09-28"
      },
      "finality": {
        "title": "Confirmations and finality",
        "question": "How should I compare an observed head with confirmations or finalized checkpoints?",
        "keywords": [
          "finality",
          "finalidade",
          "finalizado",
          "finalized",
          "confirmation",
          "confirmacoes",
          "confirmacao",
          "reorg"
        ],
        "notes": [
          "Bloch reports head height/slot and justified or finalized checkpoints separately. The highest observed height is not automatically finalized.",
          "Finality evidence is tied to a checkpoint and the active protocol rules. A source report is not an independent verification or an unconditional safety guarantee.",
          "A transaction comparison must retain its block reference and indicate whether indexer and checkpoint data came from the same or separate snapshots."
        ],
        "sources": [
          {
            "id": "bloch_rpc",
            "title": "Bloch reviewed RPC field definitions",
            "url": "https://github.com/tiagobeltraoacioli-sketch/bloch-sis-pow/blob/35d8c3029e3c7ee5417502d6c2b728184dd17b0e/crates/bloch-pos-node/src/rpc.rs"
          },
          {
            "id": "bloch_finality",
            "title": "Bloch reviewed checkpoint finality implementation",
            "url": "https://github.com/tiagobeltraoacioli-sketch/bloch-sis-pow/blob/35d8c3029e3c7ee5417502d6c2b728184dd17b0e/crates/bloch-pos-committee/src/finality.rs"
          },
          {
            "id": "space_adapter",
            "title": "Bloch Space public observation and transaction contracts",
            "url": "https://github.com/tiagobeltraoacioli-sketch/bloch-inc-porb/blob/42cac3e1bfda682ba7df92371eb26ac341d81ea6/space/chain/explorer.js"
          }
        ],
        "networks": [
          "bloch"
        ],
        "reviewed_at": "2026-09-28"
      },
      "features": {
        "title": "Bloch features and evidence",
        "question": "How should I assess Bloch features and their activation evidence?",
        "keywords": [
          "features",
          "feature",
          "funcionalidades",
          "funcionalidade",
          "recursos",
          "recurso",
          "post quantum",
          "quantum",
          "pos quantica",
          "genesis"
        ],
        "notes": [
          "Use versioned protocol documentation and runtime observations to establish feature status.",
          "A repository name, roadmap or legacy implementation does not prove that a feature is enabled on the current network.",
          "State what the supplied source demonstrates and which activation evidence is absent; do not claim an external audit or compatibility without it."
        ],
        "sources": [
          {
            "id": "bloch_reference",
            "title": "Bloch reviewed protocol and capability reference",
            "url": "https://github.com/tiagobeltraoacioli-sketch/bloch-sis-pow/blob/35d8c3029e3c7ee5417502d6c2b728184dd17b0e/README.md"
          },
          {
            "id": "bloch_params",
            "title": "Bloch reviewed epoch and activation parameters",
            "url": "https://github.com/tiagobeltraoacioli-sketch/bloch-sis-pow/blob/35d8c3029e3c7ee5417502d6c2b728184dd17b0e/crates/bloch-pos-committee/src/params.rs"
          },
          {
            "id": "explorer",
            "title": "Bloch public explorer",
            "url": "https://blochl1.com/"
          }
        ],
        "networks": [
          "bloch"
        ],
        "reviewed_at": "2026-09-28"
      },
      "health": {
        "title": "Indexer and source health",
        "question": "Explain the relationship between indexer health, network head and missing records.",
        "keywords": [
          "health",
          "saude",
          "indexer",
          "indexador",
          "lag",
          "atraso",
          "sync",
          "sincronizacao"
        ],
        "notes": [
          "An indexer can lag behind the network head. Its absence of a record does not prove the record never existed.",
          "Report indexed height, observed head and reported lag only when supplied, keeping timestamps and source coverage."
        ],
        "sources": [
          {
            "id": "space_adapter",
            "title": "Bloch Space public observation and transaction contracts",
            "url": "https://github.com/tiagobeltraoacioli-sketch/bloch-inc-porb/blob/42cac3e1bfda682ba7df92371eb26ac341d81ea6/space/chain/explorer.js"
          },
          {
            "id": "graphus_bloch",
            "title": "Graphus Bloch script-history adapter at the reviewed release",
            "url": "https://github.com/tiagobeltraoacioli-sketch/bloch-inc-porb/blob/42cac3e1bfda682ba7df92371eb26ac341d81ea6/graphus/chain/bloch-chain.js"
          },
          {
            "id": "bloch_rpc",
            "title": "Bloch reviewed RPC field definitions",
            "url": "https://github.com/tiagobeltraoacioli-sketch/bloch-sis-pow/blob/35d8c3029e3c7ee5417502d6c2b728184dd17b0e/crates/bloch-pos-node/src/rpc.rs"
          }
        ],
        "networks": [
          "bloch"
        ],
        "reviewed_at": "2026-09-28"
      },
      "fees": {
        "title": "Fees and resource costs",
        "question": "How should I interpret fees and resource measurements on the selected chain?",
        "keywords": [
          "fees",
          "fee",
          "taxa",
          "taxas",
          "gas",
          "gwei",
          "satoshi",
          "sat/vb"
        ],
        "notes": [
          "Bloch gas quantity, base-fee price and paid transaction fee are separate measurements.",
          "The reviewed implementation quotes price in millisatoshi per gas and settles fees in whole satoshis with upward rounding. Keep these units explicit.",
          "Read current and next-block price fields according to their source definitions; neither is a promise of later inclusion or an earned reward."
        ],
        "sources": [
          {
            "id": "bloch_fee",
            "title": "Bloch reviewed gas and fee arithmetic",
            "url": "https://github.com/tiagobeltraoacioli-sketch/bloch-sis-pow/blob/35d8c3029e3c7ee5417502d6c2b728184dd17b0e/crates/bloch-pos-committee/src/fee_market.rs"
          },
          {
            "id": "bloch_rpc",
            "title": "Bloch reviewed RPC field definitions",
            "url": "https://github.com/tiagobeltraoacioli-sketch/bloch-sis-pow/blob/35d8c3029e3c7ee5417502d6c2b728184dd17b0e/crates/bloch-pos-node/src/rpc.rs"
          }
        ],
        "networks": [
          "bloch"
        ],
        "reviewed_at": "2026-09-28"
      },
      "slot_epoch": {
        "title": "Slots, epochs and skipped blocks",
        "question": "How are Bloch slots, epochs and produced block heights related?",
        "keywords": [
          "epoch",
          "epochs",
          "epoca",
          "epocas",
          "slot epoch",
          "slots",
          "skipped",
          "slot vazio"
        ],
        "notes": [
          "The reviewed parameter reference defines 32 slots per epoch and a 30-second slot duration. These are versioned protocol settings, not a measured uptime claim.",
          "A slot can have no block, so height and slot need not advance together. Compute neither block production nor finality solely from elapsed wall time.",
          "Compare a source head slot, wall slot and block height only at their stated observation time and network."
        ],
        "sources": [
          {
            "id": "bloch_params",
            "title": "Bloch reviewed epoch and activation parameters",
            "url": "https://github.com/tiagobeltraoacioli-sketch/bloch-sis-pow/blob/35d8c3029e3c7ee5417502d6c2b728184dd17b0e/crates/bloch-pos-committee/src/params.rs"
          },
          {
            "id": "bloch_rpc",
            "title": "Bloch reviewed RPC field definitions",
            "url": "https://github.com/tiagobeltraoacioli-sketch/bloch-sis-pow/blob/35d8c3029e3c7ee5417502d6c2b728184dd17b0e/crates/bloch-pos-node/src/rpc.rs"
          }
        ],
        "networks": [
          "bloch"
        ],
        "reviewed_at": "2026-09-28"
      },
      "validators": {
        "title": "Validator registry and active count",
        "question": "What do Bloch validator totals, active count and stake measurements represent?",
        "keywords": [
          "validator",
          "validators",
          "validador",
          "validadores",
          "registry",
          "registro",
          "active validators"
        ],
        "notes": [
          "A registry total includes records that need not currently participate. Active count and active stake are separate source measurements.",
          "A page of validator records is not the complete registry. Preserve the page limit, unavailable rows and the source checkpoint.",
          "Validator keys or counts do not identify independent people or organizations, and do not prove decentralization or a guaranteed reward."
        ],
        "sources": [
          {
            "id": "bloch_rpc",
            "title": "Bloch reviewed RPC field definitions",
            "url": "https://github.com/tiagobeltraoacioli-sketch/bloch-sis-pow/blob/35d8c3029e3c7ee5417502d6c2b728184dd17b0e/crates/bloch-pos-node/src/rpc.rs"
          },
          {
            "id": "space_adapter",
            "title": "Bloch Space public observation and transaction contracts",
            "url": "https://github.com/tiagobeltraoacioli-sketch/bloch-inc-porb/blob/42cac3e1bfda682ba7df92371eb26ac341d81ea6/space/chain/explorer.js"
          }
        ],
        "networks": [
          "bloch"
        ],
        "reviewed_at": "2026-09-28"
      },
      "staking_lifecycle": {
        "title": "Staking admission, exit and withdrawal",
        "question": "Which evidence is needed before describing Bloch validator admission or withdrawal as active?",
        "keywords": [
          "staking",
          "stake",
          "deposit",
          "deposito",
          "withdrawal",
          "saque",
          "exit",
          "saida",
          "admission",
          "admissao"
        ],
        "notes": [
          "Funding, validator admission, activation, exit eligibility and withdrawal are different lifecycle steps. A funded record does not prove immediate participation or withdrawability.",
          "The reviewed source contains separate consensus activation gates. Inspect the deployed revision, its configured epoch and source state before claiming a lifecycle operation is enabled.",
          "Do not turn a source stake amount into an earnings forecast or payout promise. The future BlochAI GPU reward program is separate from chain validator staking."
        ],
        "sources": [
          {
            "id": "bloch_admission",
            "title": "Bloch funded-validator admission and release boundaries",
            "url": "https://github.com/tiagobeltraoacioli-sketch/bloch-sis-pow/blob/35d8c3029e3c7ee5417502d6c2b728184dd17b0e/docs/specs/BLOCH-FUNDED-VALIDATOR-ADMISSION.md"
          },
          {
            "id": "bloch_params",
            "title": "Bloch reviewed epoch and activation parameters",
            "url": "https://github.com/tiagobeltraoacioli-sketch/bloch-sis-pow/blob/35d8c3029e3c7ee5417502d6c2b728184dd17b0e/crates/bloch-pos-committee/src/params.rs"
          },
          {
            "id": "bloch_rpc",
            "title": "Bloch reviewed RPC field definitions",
            "url": "https://github.com/tiagobeltraoacioli-sketch/bloch-sis-pow/blob/35d8c3029e3c7ee5417502d6c2b728184dd17b0e/crates/bloch-pos-node/src/rpc.rs"
          }
        ],
        "networks": [
          "bloch"
        ],
        "reviewed_at": "2026-09-28"
      },
      "output_references": {
        "title": "Outpoints and spent state",
        "question": "How should Bloch outpoints, unspent outputs and spent references be read?",
        "keywords": [
          "outpoint",
          "outpoints",
          "output index",
          "indice saida",
          "vout",
          "spent",
          "gasto",
          "unspent",
          "nao gasto"
        ],
        "notes": [
          "An outpoint combines a transaction identifier with its output index. The transaction identifier alone does not select one output.",
          "An input reference describes an output being consumed; an output record describes creation. A later unspent-state query answers a separate question at its own snapshot.",
          "Do not infer an output's current spendability from an old transaction row or assign a sender identity to a script reference."
        ],
        "sources": [
          {
            "id": "bloch_rpc",
            "title": "Bloch reviewed RPC field definitions",
            "url": "https://github.com/tiagobeltraoacioli-sketch/bloch-sis-pow/blob/35d8c3029e3c7ee5417502d6c2b728184dd17b0e/crates/bloch-pos-node/src/rpc.rs"
          },
          {
            "id": "bloch_transition",
            "title": "Bloch reviewed state transition and output rules",
            "url": "https://github.com/tiagobeltraoacioli-sketch/bloch-sis-pow/blob/35d8c3029e3c7ee5417502d6c2b728184dd17b0e/crates/bloch-pos-committee/src/transition.rs"
          },
          {
            "id": "graphus_bloch",
            "title": "Graphus Bloch script-history adapter at the reviewed release",
            "url": "https://github.com/tiagobeltraoacioli-sketch/bloch-inc-porb/blob/42cac3e1bfda682ba7df92371eb26ac341d81ea6/graphus/chain/bloch-chain.js"
          }
        ],
        "networks": [
          "bloch"
        ],
        "reviewed_at": "2026-09-28"
      },
      "fee_market": {
        "title": "Gas price, rounding and block limits",
        "question": "How does the reviewed Bloch fee arithmetic distinguish gas, price and payload limits?",
        "keywords": [
          "fee market",
          "mercado taxas",
          "millisatoshi",
          "msat",
          "rounding",
          "arredondamento",
          "gas limit"
        ],
        "notes": [
          "In the reviewed arithmetic, fee calculation combines gas with a millisatoshi-per-gas price and rounds settlement upward to whole satoshis.",
          "Gas and payload-byte caps constrain different resources. A gas-limit observation alone does not establish available block space or throughput.",
          "The presence of EVM or shielded cost terms in a fee design does not establish that those transaction classes are activated on the current chain."
        ],
        "sources": [
          {
            "id": "bloch_fee",
            "title": "Bloch reviewed gas and fee arithmetic",
            "url": "https://github.com/tiagobeltraoacioli-sketch/bloch-sis-pow/blob/35d8c3029e3c7ee5417502d6c2b728184dd17b0e/crates/bloch-pos-committee/src/fee_market.rs"
          },
          {
            "id": "bloch_params",
            "title": "Bloch reviewed epoch and activation parameters",
            "url": "https://github.com/tiagobeltraoacioli-sketch/bloch-sis-pow/blob/35d8c3029e3c7ee5417502d6c2b728184dd17b0e/crates/bloch-pos-committee/src/params.rs"
          }
        ],
        "networks": [
          "bloch"
        ],
        "reviewed_at": "2026-09-28"
      },
      "mempool": {
        "title": "Pending transactions and next price",
        "question": "How should Bloch pending-transaction counts and next-price observations be interpreted?",
        "keywords": [
          "mempool",
          "pending",
          "pendente",
          "pending transactions",
          "fila",
          "next fee",
          "proxima taxa"
        ],
        "notes": [
          "Node mempool acceptance is a pending state, not inclusion in a produced or finalized block.",
          "Size, byte count and next base fee belong to the queried node and retrieval time; they are not a network-wide throughput estimate.",
          "An empty response, a reported count of zero and an unavailable source are different outcomes. Preserve that distinction in exports."
        ],
        "sources": [
          {
            "id": "bloch_rpc",
            "title": "Bloch reviewed RPC field definitions",
            "url": "https://github.com/tiagobeltraoacioli-sketch/bloch-sis-pow/blob/35d8c3029e3c7ee5417502d6c2b728184dd17b0e/crates/bloch-pos-node/src/rpc.rs"
          },
          {
            "id": "space_adapter",
            "title": "Bloch Space public observation and transaction contracts",
            "url": "https://github.com/tiagobeltraoacioli-sketch/bloch-inc-porb/blob/42cac3e1bfda682ba7df92371eb26ac341d81ea6/space/chain/explorer.js"
          }
        ],
        "networks": [
          "bloch"
        ],
        "reviewed_at": "2026-09-28"
      },
      "block_commitments": {
        "title": "Block and state commitments",
        "question": "What do Bloch block, parent and state-root fields commit to?",
        "keywords": [
          "commitment",
          "commitments",
          "compromisso",
          "state root",
          "raiz estado",
          "body root",
          "parent",
          "pai"
        ],
        "notes": [
          "Block identifier, parent reference and state/body commitments name different parts of a block observation. Keep each field's type intact.",
          "A root is a commitment to data under the protocol's encoding; reading the root from an API does not independently replay or verify that data.",
          "Compare matching network, height/slot and block identifier before using a commitment to reconcile two source responses."
        ],
        "sources": [
          {
            "id": "bloch_rpc",
            "title": "Bloch reviewed RPC field definitions",
            "url": "https://github.com/tiagobeltraoacioli-sketch/bloch-sis-pow/blob/35d8c3029e3c7ee5417502d6c2b728184dd17b0e/crates/bloch-pos-node/src/rpc.rs"
          },
          {
            "id": "bloch_transition",
            "title": "Bloch reviewed state transition and output rules",
            "url": "https://github.com/tiagobeltraoacioli-sketch/bloch-sis-pow/blob/35d8c3029e3c7ee5417502d6c2b728184dd17b0e/crates/bloch-pos-committee/src/transition.rs"
          }
        ],
        "networks": [
          "bloch"
        ],
        "reviewed_at": "2026-09-28"
      },
      "reorgs": {
        "title": "Canonical changes and checkpoints",
        "question": "How should a change in Bloch canonical block references be investigated?",
        "keywords": [
          "reorg",
          "reorganization",
          "reorganizacao",
          "canonical",
          "canonico",
          "fork",
          "conflito bloco"
        ],
        "notes": [
          "A changed block hash at the same height is evidence of a changed or conflicting observation; it is not enough to diagnose its cause.",
          "Retain both source times, parent references and checkpoint states. A node or indexer may be behind, disconnected or following a different view.",
          "Recheck transaction inclusion against the observed canonical branch and preserve uncertainty; never label a disputed head as finalized without supporting checkpoint evidence."
        ],
        "sources": [
          {
            "id": "bloch_finality",
            "title": "Bloch reviewed checkpoint finality implementation",
            "url": "https://github.com/tiagobeltraoacioli-sketch/bloch-sis-pow/blob/35d8c3029e3c7ee5417502d6c2b728184dd17b0e/crates/bloch-pos-committee/src/finality.rs"
          },
          {
            "id": "bloch_rpc",
            "title": "Bloch reviewed RPC field definitions",
            "url": "https://github.com/tiagobeltraoacioli-sketch/bloch-sis-pow/blob/35d8c3029e3c7ee5417502d6c2b728184dd17b0e/crates/bloch-pos-node/src/rpc.rs"
          },
          {
            "id": "space_adapter",
            "title": "Bloch Space public observation and transaction contracts",
            "url": "https://github.com/tiagobeltraoacioli-sketch/bloch-inc-porb/blob/42cac3e1bfda682ba7df92371eb26ac341d81ea6/space/chain/explorer.js"
          }
        ],
        "networks": [
          "bloch"
        ],
        "reviewed_at": "2026-09-28"
      },
      "upgrade_status": {
        "title": "Upgrade and activation evidence",
        "question": "How should Bloch release, build and consensus-activation evidence be distinguished?",
        "keywords": [
          "upgrade",
          "upgrades",
          "atualizacao",
          "activation",
          "ativacao",
          "flag day",
          "version",
          "versao",
          "build"
        ],
        "notes": [
          "A source commit, built binary, reported build field and network activation are different evidence. A feature title or repository name establishes none of them alone.",
          "Check the exact reviewed revision and activation rule against runtime observations. A gate set to an unreachable epoch in one reference does not describe every deployed build.",
          "Preserve disagreement or missing activation evidence. A passing test, roadmap entry or self-reported version is not an independent audit or a compatibility guarantee."
        ],
        "sources": [
          {
            "id": "bloch_params",
            "title": "Bloch reviewed epoch and activation parameters",
            "url": "https://github.com/tiagobeltraoacioli-sketch/bloch-sis-pow/blob/35d8c3029e3c7ee5417502d6c2b728184dd17b0e/crates/bloch-pos-committee/src/params.rs"
          },
          {
            "id": "bloch_reference",
            "title": "Bloch reviewed protocol and capability reference",
            "url": "https://github.com/tiagobeltraoacioli-sketch/bloch-sis-pow/blob/35d8c3029e3c7ee5417502d6c2b728184dd17b0e/README.md"
          },
          {
            "id": "bloch_rpc",
            "title": "Bloch reviewed RPC field definitions",
            "url": "https://github.com/tiagobeltraoacioli-sketch/bloch-sis-pow/blob/35d8c3029e3c7ee5417502d6c2b728184dd17b0e/crates/bloch-pos-node/src/rpc.rs"
          }
        ],
        "networks": [
          "bloch"
        ],
        "reviewed_at": "2026-09-28"
      }
    }
  }
};
