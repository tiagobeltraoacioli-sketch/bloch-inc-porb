# Initial Graphus coverage: three networks, five assets

User-selected first wave: **ETH (Ethereum native), USDT and USDC (ERC-20 on Ethereum mainnet only), BTC (Bitcoin mainnet), and BLCH (Bloch Protocol mainnet)**. USDT/USDC are assets on Ethereum, not separate chains. Solana is deferred from first-wave ingestion, public positioning, and the scheduled source probe; its offline parser remains research code.

| Asset | Network and identity | Base unit | Current implementation | Production gate |
| --- | --- | --- | --- | --- |
| ETH | Ethereum mainnet native asset | wei | Offline successful native-value parser, finalized-source height probe | Full blocks and matching receipts, finality reconciliation, reorg replay |
| USDT | Ethereum mainnet ERC-20 contract `0xdAC17F958D2ee523a2206206994597C13D831ec7` | token base units | Offline allowlisted `Transfer` log parser | Contract/source re-verification, logs backfill, mint/burn handling, decimals/metadata registry |
| USDC | Ethereum mainnet ERC-20 contract `0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48` | token base units | Offline allowlisted `Transfer` log parser | Same as USDT, including issuer/contract upgrades and asset versioning |
| BTC | Bitcoin mainnet native asset | satoshi | Offline confirmed-output parser, public tip-height probe | Local node or licensed history, UTXO input resolution, confirmation policy and reorg replay |
| BLCH | Bloch Genesis-4 mainnet native asset | satoshi | Bounded indexer sample of finalized outputs | Full input resolution, indexer/node reconciliation, asset and state-root lineage |

The `asset_id` for ERC-20 movements is `erc20:<lowercase-contract-address>`, not the symbol alone. ETH native, USDT, and USDC cannot be merged because they share an account address. The same hexadecimal address on a different EVM chain does not inherit Ethereum mainnet attribution. Values remain exact integers; displayed decimals and fiat prices require separately versioned metadata and timestamps. No token transfer is inferred from an Ethereum transaction's `to` field. A successful receipt log from an allowlisted contract with the ERC-20 `Transfer` signature is required. Mint/burn logs with a zero address are excluded from wallet-to-wallet movement parsing and need separate event types. Contract interactions and internal ETH calls require additional trace sources.

Official contract references: [Tether supported protocols](https://tether.to/en/supported-protocols/) and [Circle USDC contract addresses](https://developers.circle.com/stablecoins/usdc-contract-addresses). Event semantics: [ERC-20 standard](https://eips.ethereum.org/EIPS/eip-20) and [Solidity ABI event specification](https://docs.soliditylang.org/en/latest/abi-spec.html). Recheck official registries during each release; this snapshot is not a perpetual contract attestation.
