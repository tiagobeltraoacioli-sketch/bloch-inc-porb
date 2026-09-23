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
               "logIndex": "0x0", "topics": [TRANSFER_TOPIC,
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


if __name__ == "__main__":
    unittest.main()
