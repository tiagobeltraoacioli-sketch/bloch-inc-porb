import tempfile
import unittest
from pathlib import Path

from service.ethereum import TOKEN_CONTRACTS, TRANSFER_TOPIC
from service.ethereum_pilot import collect, write_private


BLOCK_HASH = "0x" + "a" * 64
TX1 = "0x" + "b" * 64
TX2 = "0x" + "c" * 64
USDT = next(contract for contract, symbol in TOKEN_CONTRACTS.items() if symbol == "usdt")


def fixture(url, method, params):
    if method == "eth_chainId":
        return "0x1"
    if method == "eth_getBlockByNumber":
        return {"hash": BLOCK_HASH, "number": "0x2a", "transactions": [TX1, TX2]}
    tx_hash = params[0]
    if method == "eth_getTransactionByHash":
        return {"hash": tx_hash, "blockHash": BLOCK_HASH, "blockNumber": "0x2a",
                "transactionIndex": "0x0" if tx_hash == TX1 else "0x1",
                "from": "0x" + "1" * 40, "to": "0x" + "2" * 40,
                "value": "0x64" if tx_hash == TX1 else "0x20"}
    if method == "eth_getTransactionReceipt":
        log = {"address": USDT, "blockHash": BLOCK_HASH, "transactionHash": TX1,
               "blockNumber": "0x2a", "transactionIndex": "0x0", "logIndex": "0x0", "topics": [TRANSFER_TOPIC,
               "0x" + "0" * 24 + "1" * 40, "0x" + "0" * 24 + "2" * 40],
               "data": "0x" + format(25, "064x")}
        return {"transactionHash": tx_hash, "blockHash": BLOCK_HASH, "blockNumber": "0x2a",
                "transactionIndex": "0x0" if tx_hash == TX1 else "0x1",
                "status": "0x1" if tx_hash == TX1 else "0x0",
                "logs": [log] if tx_hash == TX1 else []}
    raise AssertionError(method)


class EthereumPilotTest(unittest.TestCase):
    def test_finalized_sample_keeps_successful_native_and_allowlisted_token_events(self):
        manifest, records = collect(limit=2, fetch=fixture, rpc_url="https://rpc.example.invalid/secret")
        self.assertEqual(manifest["sampled_transactions"], 2)
        self.assertEqual(manifest["movement_counts"], {"eth": 1, "usdt": 1, "usdc": 0})
        self.assertEqual(manifest["normalized_movements"], 2)
        self.assertEqual(manifest["within_block_sample_fraction"], 1.0)
        self.assertNotIn("secret", str(manifest))
        self.assertFalse(manifest["chain_history_complete"])
        self.assertEqual(len([row for row in records if row["record_type"] == "sampled_transaction"]), 2)
        with tempfile.TemporaryDirectory() as directory:
            saved = write_private(manifest, records, Path(directory) / "private")
            self.assertEqual(saved["record_count"], 4)
            self.assertEqual((Path(directory) / "private" / "ethereum-pilot.jsonl").stat().st_mode & 0o777, 0o600)

    def test_receipt_or_network_mismatch_fails_closed(self):
        def wrong_chain(url, method, params):
            return "0x2" if method == "eth_chainId" else fixture(url, method, params)
        with self.assertRaisesRegex(ValueError, "mainnet"):
            collect(limit=1, fetch=wrong_chain)
        def wrong_receipt(url, method, params):
            result = fixture(url, method, params)
            return {**result, "blockHash": "0x" + "f" * 64} if method == "eth_getTransactionReceipt" else result
        with self.assertRaisesRegex(ValueError, "mismatch"):
            collect(limit=1, fetch=wrong_receipt)

    def test_historical_height_requires_finalized_head_and_exact_selected_height(self):
        requested = []

        def historical(url, method, params):
            if method == "eth_getBlockByNumber":
                requested.append(params[0])
            return fixture(url, method, params)

        manifest, _ = collect(limit=1, block_number=42, fetch=historical)
        self.assertEqual(requested, ["finalized", "0x2a"])
        self.assertEqual(manifest["finalized_head_number_at_collection"], 42)
        with self.assertRaisesRegex(ValueError, "exceeds source-reported finalized head"):
            collect(limit=1, block_number=43, fetch=historical)

        def wrong_height(url, method, params):
            result = fixture(url, method, params)
            if method == "eth_getBlockByNumber" and params[0] != "finalized":
                return {**result, "number": "0x29"}
            return result

        with self.assertRaisesRegex(ValueError, "height differs"):
            collect(limit=1, block_number=42, fetch=wrong_height)

    def test_transaction_position_and_duplicate_block_hashes_are_rejected(self):
        def wrong_position(url, method, params):
            result = fixture(url, method, params)
            if method == "eth_getTransactionByHash":
                return {**result, "transactionIndex": "0x1"}
            return result
        with self.assertRaisesRegex(ValueError, "mismatch"):
            collect(limit=1, fetch=wrong_position)

        def duplicate_hash(url, method, params):
            result = fixture(url, method, params)
            if method == "eth_getBlockByNumber":
                return {**result, "transactions": [TX1, TX1]}
            return result
        with self.assertRaisesRegex(ValueError, "duplicate transaction hash"):
            collect(limit=1, fetch=duplicate_hash)

    def test_unrelated_receipt_logs_must_match_transaction_and_order(self):
        def bad_log(url, method, params):
            result = fixture(url, method, params)
            if method == "eth_getTransactionReceipt":
                unrelated = {**result["logs"][0], "address": "0x" + "3" * 40,
                             "transactionIndex": "0x1"}
                return {**result, "logs": [unrelated]}
            return result
        with self.assertRaisesRegex(ValueError, "log placement"):
            collect(limit=1, fetch=bad_log)

        def duplicate_log_index(url, method, params):
            result = fixture(url, method, params)
            if method == "eth_getTransactionReceipt":
                unrelated = {**result["logs"][0], "address": "0x" + "3" * 40}
                return {**result, "logs": [result["logs"][0], unrelated]}
            return result
        with self.assertRaisesRegex(ValueError, "out of order or duplicated"):
            collect(limit=1, fetch=duplicate_log_index)


if __name__ == "__main__":
    unittest.main()
