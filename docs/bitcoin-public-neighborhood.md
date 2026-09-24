# Bounded public Bitcoin address neighborhood

`GET /api/chain/wallet?network=bitcoin&asset=BTC&address=<mainnet-address>` reads a single address from the public [Blockstream Esplora API](https://github.com/Blockstream/esplora/blob/master/API.md). The endpoint returns the source-reported confirmed address aggregate, confirmed and mempool transaction counts, and observations from at most eight transactions in the first confirmed-transaction page. It does not crawl full history or infer a wallet owner.

Transaction nodes connect source-reported input prevout addresses to a transaction (`observed_input_prevout`) and the transaction to its output addresses (`created_output`). Each edge preserves its transaction ID, output or input position, block reference, and exact satoshi amount as a decimal string. These are transaction structure observations. They do not say which person controlled an input or that one input funded a particular output.

After building this bounded graph, the endpoint selects at most six unique non-query address nodes in bytewise lexicographic order. It queries each selected address's Esplora summary with a four-second timeout and no more than three concurrent calls. A successful node has:

```json
{
  "balance": {
    "base_units": "9000",
    "unit": "sat",
    "scope": "source_confirmed_address_aggregate",
    "retrieved_at": "2026-09-23T12:00:01.000Z"
  }
}
```

If a selected lookup fails, its `balance` is `null`. Other unselected address nodes have no `balance` field. Neither case means zero. The query address node also carries a balance with its own retrieval time. The top-level `balance` repeats that query address's amount for the detail panel, and `observation.retrieved_at` marks the query address summary retrieval. `observation.neighborhood` records the selection rule and attempted/enriched counts. Balances are separate source reads at different times and are not a synchronized UTXO snapshot; no block anchor is claimed for the aggregate. `independent_verification` remains `false`.

The response is bounded to four MiB of upstream JSON, eight transactions, 24 inputs and 24 outputs per transaction, and six neighbor lookups. The public API operator can see searched addresses. The data is suitable for source-attributed exploration, not complete wallet holdings, ownership attribution, or AML scoring.
