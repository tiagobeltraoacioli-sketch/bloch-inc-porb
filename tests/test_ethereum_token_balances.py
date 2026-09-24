"""Token balances are tied to one block and only event candidates are ranked."""

import io
import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from service.ethereum_token_balances import collect, rpc_batch, top_event_candidates
from service.ethereum_token_candidates import scan
from tests.test_ethereum_token_candidates import A, B, C, BLOCK_HASH, transfer


class TokenBalanceTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.index = Path(self.temp.name) / "usdc.sqlite"
        scan(asset="USDC", index=self.index, rpc_url="http://127.0.0.1:8545",
             max_ranges=3, window=2, call=self.discovery_rpc)

    def discovery_rpc(self, _url, method, params):
        if method == "eth_syncing":
            return False
        if method == "eth_getBlockByNumber":
            return {"number": "0x2", "hash": BLOCK_HASH}
        if method == "eth_getLogs":
            first, last = int(params[0]["fromBlock"], 16), int(params[0]["toBlock"], 16)
            return [log for log in (transfer(1, A, B), transfer(2, B, C, 1))
                    if first <= int(log["blockNumber"], 16) <= last]
        raise AssertionError(method)

    def rpc(self, _url, method, _params):
        if method == "eth_syncing":
            return False
        if method == "eth_getBlockByNumber":
            return {"number": "0x2", "hash": BLOCK_HASH}
        raise AssertionError(method)

    def test_complete_same_block_reads_rank_exactly_without_global_claim(self):
        amounts = {A: 1000, B: 0, C: 999}
        def batch(_url, requests):
            self.assertTrue(all(params[1] == {"blockHash": BLOCK_HASH,
                                              "requireCanonical": True}
                                for _, params in requests))
            return [hex(amounts["0x" + params[0]["data"][-40:]])
                    for _, params in requests]
        result = collect(asset="USDC", index=self.index,
                         rpc_url="http://127.0.0.1:8545", call=self.rpc,
                         batch_call=batch, max_accounts=2)
        self.assertEqual(result["remaining"], 1)
        with self.assertRaisesRegex(ValueError, "incomplete"):
            top_event_candidates(self.index, asset="USDC")
        result = collect(asset="USDC", index=self.index,
                         rpc_url="http://127.0.0.1:8545", call=self.rpc,
                         batch_call=batch, max_accounts=2)
        self.assertEqual(result["remaining"], 0)
        ranked = top_event_candidates(self.index, asset="USDC")
        self.assertEqual([row["address"] for row in ranked["rows"]], [A, C])
        self.assertFalse(ranked["network_wide_holder_discovery_complete"])

    @patch("service.ethereum_token_balances.urllib.request.urlopen")
    def test_json_rpc_batch_response_order_is_by_id(self, opener):
        opener.return_value = io.BytesIO(json.dumps([
            {"jsonrpc": "2.0", "id": 1, "result": "0x2"},
            {"jsonrpc": "2.0", "id": 0, "result": "0x1"},
        ]).encode())
        result = rpc_batch("http://127.0.0.1:8545",
                           [("eth_call", []), ("eth_call", [])])
        self.assertEqual(result, ["0x1", "0x2"])


if __name__ == "__main__":
    unittest.main()
