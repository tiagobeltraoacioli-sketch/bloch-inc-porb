# Graphus Bitcoin state source

`bloch-dex` runs Bitcoin Core 31.1 from the official Linux archive at
`https://bitcoincore.org/bin/bitcoin-core-31.1/`. The archive checksum matched
the release `SHA256SUMS`, and the detached checksum signature validated under
Michael Ford's key with primary fingerprint
`E777299FC265DD04793070EB944D35F9AC3DB76A`. The installed binaries live
under `/opt/graphus-bitcoin/31.1/bin`. The systemd unit and config in this
directory are the deployed definitions.

The node uses a 100 GB block-file prune target. This retains the current UTXO
set, which can be exported after initial block download completes. RPC accepts
only loopback connections and the `graphusbtc` user owns its data directory.
The BI-PoRB timers remain separate.

Check progress without exposing the RPC cookie:

```sh
sudo -u graphusbtc /opt/graphus-bitcoin/31.1/bin/bitcoin-cli \
  -conf=/etc/graphus-bitcoin/bitcoin.conf \
  -datadir=/var/lib/graphus-bitcoin getblockchaininfo
```

Do not create or publish a network-wide ranking while
`initialblockdownload=true`. Once fully validated, use Bitcoin Core's
`dumptxoutset <path> latest` and its official
`contrib/utxo-tools/utxo_to_sqlite.py` to convert the snapshot. Preserve the
RPC result, snapshot hash, converter version, and exact Bitcoin block anchor.
Rank exact `scriptPubKey` balances from the converted SQLite database and use
Bitcoin Core `decodescript` to obtain an address where one is defined. A
`scriptPubKey` or address is not a wallet owner. The snapshot covers confirmed
UTXOs at one block; it excludes mempool transactions and unspendable outputs.

References: [dumptxoutset](https://bitcoincore.org/en/doc/30.0.0/rpc/blockchain/dumptxoutset/),
[official converter](https://github.com/bitcoin/bitcoin/blob/master/contrib/utxo-tools/utxo_to_sqlite.py),
[decodescript](https://bitcoincore.org/en/doc/30.0.0/rpc/rawtransactions/decodescript/).
