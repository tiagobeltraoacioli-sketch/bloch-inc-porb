"""ERC-20 transfer discovery must resume without claiming holder completeness."""

import sqlite3
import tempfile
import unittest
from pathlib import Path

from service.ethereum import TRANSFER_TOPIC
from service.ethereum_token_candidates import CONTRACTS, RpcError, scan


BLOCK_HASH = "0x" + "a" * 64
TX_HASH = "0x" + "b" * 64
A = "0x" + "1" * 40
B = "0x" + "2" * 40
C = "0x" + "3" * 40


def topic(address):
    return "0x" + "0" * 24 + address[2:]


def transfer(height, sender, recipient, index=0):
    return {"address": CONTRACTS["USDC"], "removed": False,
            "blockHash": BLOCK_HASH, "transactionHash": TX_HASH,
            "blockNumber": hex(height), "logIndex": hex(index),
            "topics": [TRANSFER_TOPIC, topic(sender), topic(recipient)],
            "data": "0x" + "0" * 63 + "1"}


class TokenCandidateTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.index = Path(self.temp.name) / "private" / "usdc.sqlite"
        self.calls = []

    def rpc(self, _url, method, params):
        self.calls.append((method, params))
        if method == "eth_syncing":
            return False
        if method == "eth_getBlockByNumber":
            return {"number": "0x2", "hash": BLOCK_HASH}
        if method == "eth_getLogs":
            first, last = int(params[0]["fromBlock"], 16), int(params[0]["toBlock"], 16)
            return [log for log in (transfer(1, A, B), transfer(2, B, C, 1))
                    if first <= int(log["blockNumber"], 16) <= last]
        raise AssertionError(method)

    def test_resume_and_preserve_coverage_boundary(self):
        first = scan(asset="USDC", index=self.index, rpc_url="http://127.0.0.1:8545",
                     max_ranges=1, window=2, call=self.rpc)
        self.assertEqual(first["next_block"], 2)
        self.assertFalse(first["transfer_history_scan_complete"])
        second = scan(asset="USDC", index=self.index, rpc_url="http://127.0.0.1:8545",
                      max_ranges=2, window=2, call=self.rpc)
        self.assertEqual(second["status"], "transfer_scan_complete")
        self.assertEqual(second["candidate_count"], 3)
        self.assertFalse(second["network_wide_holder_discovery_complete"])
        with sqlite3.connect(self.index) as db:
            self.assertEqual(db.execute("SELECT transfer_events FROM candidates WHERE address=?",
                                        (B,)).fetchone()[0], 2)

    def test_result_limit_splits_range_without_skipping(self):
        def limited(url, method, params):
            if method == "eth_getLogs" and params[0]["fromBlock"] == "0x0" and params[0]["toBlock"] == "0x1":
                raise RpcError("too many results")
            return self.rpc(url, method, params)
        result = scan(asset="USDC", index=self.index, rpc_url="http://127.0.0.1:8545",
                      max_ranges=1, window=2, call=limited)
        self.assertEqual(result["next_block"], 1)
        self.assertEqual(result["candidate_count"], 0)

    def test_bad_log_does_not_advance_cursor(self):
        def bad(url, method, params):
            if method == "eth_getLogs":
                row = transfer(1, A, B)
                row["address"] = CONTRACTS["USDT"]
                return [row]
            return self.rpc(url, method, params)
        with self.assertRaisesRegex(ValueError, "invalid or removed"):
            scan(asset="USDC", index=self.index, rpc_url="http://127.0.0.1:8545",
                 max_ranges=1, window=2, call=bad)
        with sqlite3.connect(self.index) as db:
            self.assertEqual(db.execute("SELECT value FROM metadata WHERE key='next_block'").fetchone()[0], "0")

    def test_sync_gate_does_not_create_index(self):
        result = scan(asset="USDC", index=self.index, rpc_url="http://127.0.0.1:8545",
                      call=lambda *_: {"startingBlock": "0x0"})
        self.assertEqual(result["status"], "waiting_for_archive_sync")
        self.assertFalse(self.index.exists())


if __name__ == "__main__":
    unittest.main()
