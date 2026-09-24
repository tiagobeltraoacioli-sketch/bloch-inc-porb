# Bounded Ethereum token activity

`GET /api/chain/activity?asset=USDC&address=0x...` and the equivalent USDT query return source-reported ERC-20 `Transfer` logs for one Ethereum mainnet address. The public Pages function requires `GRAPHUS_ETHEREUM_RPC_URL` to be a configured HTTPS Ethereum JSON-RPC endpoint. It checks `eth_chainId == 1`, reads the source-reported `finalized` block, and queries the latest 64 or fewer finalized blocks with separate indexed sender and recipient filters. It accepts only the fixed mainnet USDT and USDC contracts.

Each event retains exact token base units, block number and hash, transaction hash and index, log index, from and to addresses, and direction relative to the queried address. A self-transfer matched by both filters appears once. A response over 128 logs in either direction returns `ethereum_activity_window_too_dense` with no partial event list. A source error, inconsistent log, or invalid block anchor also fails closed. No names or ownership claims are attached to addresses.

The endpoint is a recent, bounded observation, **not complete transaction history or a balance calculation**. The RPC reports finality and logs; Graphus does not independently validate the chain or reconcile a second source here. Contract effects without emitted `Transfer` logs are not represented. Native ETH activity returns `native_eth_activity_requires_transaction_index` until a bounded transaction index is available. Querying an external RPC exposes the searched address to its operator.

The endpoint is read-only and separate from BI-PoRB scoring. It must not be used to infer AML risk, ownership, or a holder ranking from its event count.
