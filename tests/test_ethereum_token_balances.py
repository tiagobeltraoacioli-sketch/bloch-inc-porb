"""Token balances are tied to one block and only event candidates are ranked."""

import io
import json
import sqlite3
import stat
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
        output = self.index.with_name("usdc-top64.json")
        def batch(_url, requests):
            self.assertTrue(all(params[1] == {"blockHash": BLOCK_HASH,
                                              "requireCanonical": True}
                                for _, params in requests))
            return [hex(amounts["0x" + params[0]["data"][-40:]])
                    for _, params in requests]
        result = collect(asset="USDC", index=self.index,
                         rpc_url="http://127.0.0.1:8545", call=self.rpc,
                         batch_call=batch, max_accounts=2,
                         private_top64_output=output)
        self.assertEqual(result["remaining"], 1)
        self.assertEqual(result["private_top64_artifact"], "waiting_for_balance_reads")
        self.assertFalse(output.exists())
        with self.assertRaisesRegex(ValueError, "incomplete"):
            top_event_candidates(self.index, asset="USDC")
        result = collect(asset="USDC", index=self.index,
                         rpc_url="http://127.0.0.1:8545", call=self.rpc,
                         batch_call=batch, max_accounts=2,
                         private_top64_output=output)
        self.assertEqual(result["remaining"], 0)
        self.assertEqual(result["private_top64_artifact"], "built_private")
        artifact = json.loads(output.read_text())
        self.assertEqual(artifact["publication_status"], "private_pending_review")
        self.assertEqual(artifact["block_hash"], BLOCK_HASH)
        self.assertEqual([row["address"] for row in artifact["rows"]], [A, C])
        self.assertEqual(stat.S_IMODE(output.stat().st_mode), 0o600)
        repeat = collect(asset="USDC", index=self.index,
                         rpc_url="http://127.0.0.1:8545", call=self.rpc,
                         batch_call=batch, private_top64_output=output)
        self.assertEqual(repeat["private_top64_artifact"], "already_built")
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

    def test_private_top_rejects_incomplete_or_corrupt_candidate_balances(self):
        collect(asset="USDC", index=self.index, rpc_url="http://127.0.0.1:8545",
                call=self.rpc, batch_call=lambda _url, requests: ["0x1"] * len(requests))
        with sqlite3.connect(self.index) as db:
            db.execute("DELETE FROM balances WHERE address=?", (A,))
        with self.assertRaisesRegex(ValueError, "coverage"):
            top_event_candidates(self.index, asset="USDC")
        with sqlite3.connect(self.index) as db:
            db.execute("INSERT INTO balances VALUES (?, ?)", (A, "01"))
        with self.assertRaisesRegex(ValueError, "invalid candidate balance"):
            top_event_candidates(self.index, asset="USDC")
        with sqlite3.connect(self.index) as db:
            db.execute("UPDATE balances SET amount_base_units='1' WHERE address=?", (A,))
            db.execute("UPDATE metadata SET value='false' WHERE key='transfer_history_scan_complete'")
        with self.assertRaisesRegex(ValueError, "incomplete"):
            top_event_candidates(self.index, asset="USDC")

    def test_reorg_before_artifact_write_keeps_private_output_absent(self):
        output = self.index.with_name("usdc-top64.json")
        block_calls = 0

        def changing_rpc(url, method, params):
            nonlocal block_calls
            if method == "eth_getBlockByNumber":
                block_calls += 1
                return {"number": "0x2", "hash": BLOCK_HASH if block_calls == 1
                        else "0x" + "f" * 64}
            return self.rpc(url, method, params)

        with self.assertRaisesRegex(ValueError, "changed during collection"):
            collect(asset="USDC", index=self.index, rpc_url="http://127.0.0.1:8545",
                    call=changing_rpc,
                    batch_call=lambda _url, requests: ["0x1"] * len(requests),
                    private_top64_output=output)
        self.assertFalse(output.exists())
        with self.assertRaisesRegex(ValueError, "incomplete"):
            top_event_candidates(self.index, asset="USDC")

    def test_reorg_after_index_completion_prevents_private_file(self):
        output = self.index.with_name("usdc-top64.json")
        block_calls = 0

        def changing_rpc(url, method, params):
            nonlocal block_calls
            if method == "eth_getBlockByNumber":
                block_calls += 1
                return {"number": "0x2", "hash": BLOCK_HASH if block_calls < 3
                        else "0x" + "f" * 64}
            return self.rpc(url, method, params)

        with self.assertRaisesRegex(ValueError, "before private artifact write"):
            collect(asset="USDC", index=self.index, rpc_url="http://127.0.0.1:8545",
                    call=changing_rpc,
                    batch_call=lambda _url, requests: ["0x1"] * len(requests),
                    private_top64_output=output)
        self.assertFalse(output.exists())


if __name__ == "__main__":
    unittest.main()
