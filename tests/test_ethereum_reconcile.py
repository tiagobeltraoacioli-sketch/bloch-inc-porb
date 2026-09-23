import json
import tempfile
import unittest
from pathlib import Path

from service.ethereum_pilot import collect, write_private as write_pilot
from service.ethereum_reconcile import reconcile, write_private


BLOCK = "0x" + "a" * 64
TX = "0x" + "b" * 64


def source(url, method, params):
    if method == "eth_chainId":
        return "0x1"
    if method == "eth_getBlockByNumber":
        return {"hash": BLOCK, "number": "0x2a", "transactions": [TX]}
    if method == "eth_getBlockByHash":
        return {"hash": BLOCK, "number": "0x2a", "transactions": [TX]}
    if method == "eth_getTransactionByHash":
        return {"hash": TX, "blockHash": BLOCK, "blockNumber": "0x2a", "transactionIndex": "0x0",
                "from": "0x" + "1" * 40, "to": "0x" + "2" * 40, "value": "0x0"}
    if method == "eth_getTransactionReceipt":
        return {"transactionHash": TX, "blockHash": BLOCK, "blockNumber": "0x2a",
                "transactionIndex": "0x0", "status": "0x0", "logs": []}
    raise AssertionError(method)


class EthereumReconcileTest(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory()
        self.addCleanup(self.temporary.cleanup)
        self.pilot = Path(self.temporary.name) / "pilot"
        manifest, records = collect(limit=1, fetch=source, rpc_url="https://primary.example/rpc")
        write_pilot(manifest, records, self.pilot)

    def test_exact_sample_reconciles_without_public_identifiers(self):
        calls = []

        def fetch(url, method, params):
            calls.append(method)
            return source(url, method, params)

        report = reconcile(self.pilot, fetch=fetch, rpc_url="https://other.example/rpc")
        self.assertEqual(report["sampled_transactions_compared"], 1)
        self.assertEqual(report["rpc_calls"], 8)
        self.assertEqual(calls.count("eth_getBlockByNumber"), 4)
        self.assertFalse(report["consensus_independently_validated"])
        self.assertFalse(report["operator_independence_verified"])
        self.assertFalse(report["full_receipt_payload_reconciled"])
        self.assertNotIn(TX, str(report))
        self.assertNotIn(BLOCK, str(report))
        destination = Path(self.temporary.name) / "private" / "report.json"
        digest = write_private(report, destination)
        self.assertEqual(len(digest), 64)
        self.assertEqual(destination.stat().st_mode & 0o777, 0o600)
        self.assertEqual(json.loads(destination.read_text())["sampled_transactions_compared"], 1)

    def test_mismatched_block_or_receipt_fails_closed(self):
        def wrong_block(url, method, params):
            result = source(url, method, params)
            if method == "eth_getBlockByNumber" and params[0] == "0x2a":
                return {**result, "hash": "0x" + "c" * 64}
            return result

        with self.assertRaisesRegex(ValueError, "block identity"):
            reconcile(self.pilot, fetch=wrong_block, rpc_url="https://other.example")

        def wrong_receipt(url, method, params):
            result = source(url, method, params)
            return {**result, "status": "0x1"} if method == "eth_getTransactionReceipt" else result

        with self.assertRaisesRegex(ValueError, "receipt differs"):
            reconcile(self.pilot, fetch=wrong_receipt, rpc_url="https://other.example")

    def test_same_host_and_tampered_pilot_rejected(self):
        with self.assertRaisesRegex(ValueError, "distinct HTTPS"):
            reconcile(self.pilot, fetch=source, rpc_url="https://primary.example/other")
        path = self.pilot / "ethereum-pilot.jsonl"
        path.write_bytes(path.read_bytes() + b"{}\n")
        with self.assertRaisesRegex(ValueError, "digest mismatch"):
            reconcile(self.pilot, fetch=source, rpc_url="https://other.example")

    def test_secondary_finalized_head_must_cover_sample_and_stay_stable(self):
        def behind(url, method, params):
            result = source(url, method, params)
            if method == "eth_getBlockByNumber" and params[0] == "finalized":
                return {**result, "number": "0x29"}
            return result

        with self.assertRaisesRegex(ValueError, "has not finalized"):
            reconcile(self.pilot, fetch=behind, rpc_url="https://other.example")

        finalized_calls = 0

        def regress(url, method, params):
            nonlocal finalized_calls
            result = source(url, method, params)
            if method == "eth_getBlockByNumber" and params[0] == "finalized":
                finalized_calls += 1
                return {**result, "number": "0x2b" if finalized_calls == 1 else "0x2a"}
            return result

        with self.assertRaisesRegex(ValueError, "regressed"):
            reconcile(self.pilot, fetch=regress, rpc_url="https://other.example")


if __name__ == "__main__":
    unittest.main()
