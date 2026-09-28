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
        ]
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
        ]
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
        ]
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
            "title": "Bitcoin wallet guide",
            "url": "https://developer.bitcoin.org/devguide/wallets.html"
          },
          {
            "id": "eth_accounts",
            "title": "Ethereum accounts",
            "url": "https://ethereum.org/developers/docs/accounts/"
          }
        ]
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
            "title": "Ethereum transactions",
            "url": "https://ethereum.org/developers/docs/transactions/"
          }
        ]
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
        ]
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
          "Bitcoin transactions spend previous outputs; Ethereum transactions authorize account state changes.",
          "Use the selected chain and supplied records. Do not treat an address as an identity or assume a payment purpose."
        ],
        "sources": [
          {
            "id": "btc_tx",
            "title": "Bitcoin transaction structure",
            "url": "https://developer.bitcoin.org/devguide/transactions.html"
          },
          {
            "id": "eth_tx",
            "title": "Ethereum transactions",
            "url": "https://ethereum.org/developers/docs/transactions/"
          }
        ]
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
          "A Bitcoin input references a previous output; an unspent output can later be spent under its script conditions.",
          "A wallet balance can aggregate several UTXOs. A displayed address is not necessarily the whole wallet."
        ],
        "sources": [
          {
            "id": "btc_tx",
            "title": "Bitcoin transaction structure",
            "url": "https://developer.bitcoin.org/devguide/transactions.html"
          }
        ]
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
            "title": "Ethereum accounts",
            "url": "https://ethereum.org/developers/docs/accounts/"
          }
        ]
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
          "Bitcoin fees and Ethereum gas measurements use different units and mechanisms.",
          "Ethereum gas measures execution work; gas price and total transaction cost are not interchangeable.",
          "Use source-reported measurements only. A snapshot is not a guaranteed future inclusion price."
        ],
        "sources": [
          {
            "id": "btc_chain",
            "title": "Bitcoin block chain guide",
            "url": "https://developer.bitcoin.org/devguide/block_chain.html"
          },
          {
            "id": "eth_gas",
            "title": "Ethereum gas and fees",
            "url": "https://ethereum.org/developers/docs/gas/"
          }
        ]
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
            "title": "Bitcoin block chain guide",
            "url": "https://developer.bitcoin.org/devguide/block_chain.html"
          },
          {
            "id": "eth_pos",
            "title": "Ethereum proof of stake",
            "url": "https://ethereum.org/developers/docs/consensus-mechanisms/pos/"
          },
          {
            "id": "explorer",
            "title": "Bloch public explorer",
            "url": "https://blochl1.com/"
          }
        ]
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
        ]
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
        ]
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
        ]
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
            "title": "Bitcoin wallet guide",
            "url": "https://developer.bitcoin.org/devguide/wallets.html"
          },
          {
            "id": "eth_accounts",
            "title": "Ethereum accounts",
            "url": "https://ethereum.org/developers/docs/accounts/"
          }
        ]
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
            "title": "Ethereum transactions",
            "url": "https://ethereum.org/developers/docs/transactions/"
          }
        ]
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
        ]
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
            "title": "Bitcoin block chain guide",
            "url": "https://developer.bitcoin.org/devguide/block_chain.html"
          },
          {
            "id": "eth_pos",
            "title": "Ethereum proof of stake",
            "url": "https://ethereum.org/developers/docs/consensus-mechanisms/pos/"
          }
        ]
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
        ]
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
          "A Bitcoin input references a previous output; an unspent output can later be spent under its script conditions.",
          "A wallet balance can aggregate several UTXOs. A displayed address is not necessarily the whole wallet."
        ],
        "sources": [
          {
            "id": "btc_tx",
            "title": "Bitcoin transaction structure",
            "url": "https://developer.bitcoin.org/devguide/transactions.html"
          }
        ]
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
            "title": "Ethereum accounts",
            "url": "https://ethereum.org/developers/docs/accounts/"
          }
        ]
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
          "Bitcoin fees and Ethereum gas measurements use different units and mechanisms.",
          "Ethereum gas measures execution work; gas price and total transaction cost are not interchangeable.",
          "Use source-reported measurements only. A snapshot is not a guaranteed future inclusion price."
        ],
        "sources": [
          {
            "id": "btc_chain",
            "title": "Bitcoin block chain guide",
            "url": "https://developer.bitcoin.org/devguide/block_chain.html"
          },
          {
            "id": "eth_gas",
            "title": "Ethereum gas and fees",
            "url": "https://ethereum.org/developers/docs/gas/"
          }
        ]
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
            "title": "Bitcoin block chain guide",
            "url": "https://developer.bitcoin.org/devguide/block_chain.html"
          },
          {
            "id": "eth_pos",
            "title": "Ethereum proof of stake",
            "url": "https://ethereum.org/developers/docs/consensus-mechanisms/pos/"
          },
          {
            "id": "explorer",
            "title": "Bloch public explorer",
            "url": "https://blochl1.com/"
          }
        ]
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
            "id": "bloch",
            "title": "Bloch protocol source and feature status",
            "url": "https://github.com/tiagobeltraoacioli-sketch/bloch-sis-pow"
          },
          {
            "id": "explorer",
            "title": "Bloch public explorer",
            "url": "https://blochl1.com/"
          }
        ]
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
          "A block groups transaction records under the selected chain rules.",
          "A block height, block hash and slot are distinct identifiers. Inclusion alone is not proof of current finality."
        ],
        "sources": [
          {
            "id": "btc_chain",
            "title": "Bitcoin block chain guide",
            "url": "https://developer.bitcoin.org/devguide/block_chain.html"
          },
          {
            "id": "explorer",
            "title": "Bloch public explorer",
            "url": "https://blochl1.com/"
          }
        ]
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
          "Bitcoin transactions spend previous outputs; Ethereum transactions authorize account state changes.",
          "Use the selected chain and supplied records. Do not treat an address as an identity or assume a payment purpose."
        ],
        "sources": [
          {
            "id": "btc_tx",
            "title": "Bitcoin transaction structure",
            "url": "https://developer.bitcoin.org/devguide/transactions.html"
          },
          {
            "id": "eth_tx",
            "title": "Ethereum transactions",
            "url": "https://ethereum.org/developers/docs/transactions/"
          }
        ]
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
          "An extended UTXO associates additional validation data or conditions with an unspent output.",
          "Do not infer activation on the current Bloch network from an explorer label or legacy implementation. Source-code capability and live protocol status are separate evidence."
        ],
        "sources": [
          {
            "id": "bloch",
            "title": "Bloch protocol source and feature status",
            "url": "https://github.com/tiagobeltraoacioli-sketch/bloch-sis-pow"
          },
          {
            "id": "explorer",
            "title": "Bloch public explorer",
            "url": "https://blochl1.com/"
          }
        ]
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
        ]
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
            "title": "Bitcoin wallet guide",
            "url": "https://developer.bitcoin.org/devguide/wallets.html"
          },
          {
            "id": "eth_accounts",
            "title": "Ethereum accounts",
            "url": "https://ethereum.org/developers/docs/accounts/"
          }
        ]
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
            "title": "Ethereum transactions",
            "url": "https://ethereum.org/developers/docs/transactions/"
          }
        ]
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
        ]
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
            "title": "Bitcoin block chain guide",
            "url": "https://developer.bitcoin.org/devguide/block_chain.html"
          },
          {
            "id": "eth_pos",
            "title": "Ethereum proof of stake",
            "url": "https://ethereum.org/developers/docs/consensus-mechanisms/pos/"
          },
          {
            "id": "explorer",
            "title": "Bloch public explorer",
            "url": "https://blochl1.com/"
          }
        ]
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
            "id": "bloch",
            "title": "Bloch protocol source and feature status",
            "url": "https://github.com/tiagobeltraoacioli-sketch/bloch-sis-pow"
          },
          {
            "id": "explorer",
            "title": "Bloch public explorer",
            "url": "https://blochl1.com/"
          }
        ]
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
            "id": "explorer",
            "title": "Bloch public explorer",
            "url": "https://blochl1.com/"
          },
          {
            "id": "space",
            "title": "Bloch Space public chain workspace",
            "url": "https://bloch.space/app/"
          }
        ]
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
          "Bitcoin fees and Ethereum gas measurements use different units and mechanisms.",
          "Ethereum gas measures execution work; gas price and total transaction cost are not interchangeable.",
          "Use source-reported measurements only. A snapshot is not a guaranteed future inclusion price."
        ],
        "sources": [
          {
            "id": "btc_chain",
            "title": "Bitcoin block chain guide",
            "url": "https://developer.bitcoin.org/devguide/block_chain.html"
          },
          {
            "id": "eth_gas",
            "title": "Ethereum gas and fees",
            "url": "https://ethereum.org/developers/docs/gas/"
          }
        ]
      }
    }
  }
};
