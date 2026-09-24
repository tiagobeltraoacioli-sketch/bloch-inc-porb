# Private Bitcoin header proof-of-work check

`service.bitcoin_pow` verifies a single schema-v3 Bitcoin mainnet pilot artifact and checks its stored 80-byte header hash against the target encoded in `nBits`. It applies the Bitcoin mainnet proof-of-work limit, rejects negative, zero, overflowed, or too-easy targets, and requires the recomputed hash to be at or below the target. It first repeats the artifact's transaction body, header hash, and Merkle inclusion checks. The report is bound to the exact pilot digest.

The target decoding and range rules follow [Bitcoin Core's `SetCompact`](https://github.com/bitcoin/bitcoin/blob/master/src/arith_uint256.cpp), [`DeriveTarget` and `CheckProofOfWorkImpl`](https://github.com/bitcoin/bitcoin/blob/master/src/pow.cpp), and the [mainnet `powLimit`](https://github.com/bitcoin/bitcoin/blob/master/src/kernel/chainparams.cpp).

Run in the private data environment:

```sh
python3 -m service.bitcoin_pow \
  --pilot /var/lib/bi-porb/private/bitcoin/bitcoin-block-pilot-v3.json \
  --output /var/lib/bi-porb/private/bitcoin/bitcoin-pow-v3.json
```

The report is mode `0600` and contains only aggregate provenance, the encoded target, and explicit verification flags. For the five-transaction pilot at source-reported height 968321, `nBits=17021ec5` and the stored header hash satisfies the claimed target. The result says **nothing** about whether that target was the correct difficulty for its height, whether prior blocks were valid, which chain has the most cumulative work, or whether this block remains in the current best chain. Those checks require validated chain history and ongoing reorganization handling. No wallet identifiers, AML scores, or public result are produced.
