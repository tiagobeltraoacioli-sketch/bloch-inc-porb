# Graphus Ethereum state source

`bloch-bridge` runs Erigon v3.6.1 with its embedded Caplin consensus client.
The command is recorded in `run-erigon.sh`; it will not replace an existing
container. Execution and consensus RPC listeners are bound to loopback. The
container is capped at 16 CPUs and 48 GB of memory. State resides in
`/var/lib/graphus/ethereum` and is private to its service UID.

Check progress with `sudo docker logs --tail 30 graphus-erigon` and query
`eth_syncing` and the finalized block over local JSON-RPC. Snapshot download
progress alone is not proof of a fully validated tip. Before enumerating ETH
accounts, validate the execution and consensus sync states and record a single
finalized block hash. Then add the local `debug` RPC module and test Erigon's
`debug_accountRange` pagination on that pinned block. USDT and USDC need
contract-specific holder discovery plus `balanceOf` at the same block; ETH
account enumeration cannot establish token-holder completeness by itself.

References: [Erigon hardware requirements](https://docs.erigon.tech/get-started/hardware-requirements),
[Caplin](https://docs.erigon.tech/fundamentals/caplin),
[debug account range](https://docs.erigon.tech/interacting-with-erigon/debug).
