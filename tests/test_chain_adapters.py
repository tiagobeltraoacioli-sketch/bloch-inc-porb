import unittest

from service.bitcoin import confirmed_outputs
from service.ethereum import TOKEN_CONTRACTS, TRANSFER_TOPIC, erc20_transfers, native_value_movement
from service.solana import token_balance_deltas


class ChainAdapterTest(unittest.TestCase):
    def test_ethereum_requires_matching_successful_receipt(self):
        block = {"hash": "0x" + "a" * 64, "number": "0x2a"}
        tx = {"hash": "0x" + "b" * 64, "from": "0x" + "1" * 40, "to": "0x" + "2" * 40, "value": "0x64", "transactionIndex": "0x0"}
        receipt = {"transactionHash": tx["hash"], "blockHash": block["hash"], "status": "0x1"}
        movement = native_value_movement(block, tx, receipt)
        self.assertEqual(movement.amount_base_units, 100)
        self.assertEqual(movement.sender, tx["from"])
        self.assertEqual(movement.finality, "finalized")
        receipt["status"] = "0x0"
        self.assertIsNone(native_value_movement(block, tx, receipt))
        receipt["blockHash"] = "0x" + "c" * 64
        with self.assertRaises(ValueError):
            native_value_movement(block, tx, receipt)

    def test_bitcoin_outputs_never_assert_a_sender(self):
        tx = {"txid": "a" * 64, "status": {"confirmed": True, "block_hash": "b" * 64, "block_height": 900},
              "vout": [{"value": 500, "scriptpubkey": "0014" + "c" * 40, "scriptpubkey_address": "bc1q" + "d" * 38},
                       {"value": 10, "scriptpubkey": "51" + "e" * 1000}]}
        outputs = confirmed_outputs(tx)
        self.assertEqual(len(outputs), 2)
        self.assertIsNone(outputs[0].sender)
        self.assertEqual(outputs[0].sender_attribution, "unknown")
        self.assertTrue(outputs[1].destination.startswith("script:"))
        tx["status"]["confirmed"] = False
        with self.assertRaises(ValueError):
            confirmed_outputs(tx)

    def test_only_pinned_usdt_usdc_erc20_logs_are_movements(self):
        block = {"hash": "0x" + "a" * 64, "number": "0x2a"}
        tx_hash = "0x" + "b" * 64
        base = {"blockHash": block["hash"], "transactionHash": tx_hash, "status": "0x1"}
        logs = []
        for index, contract in enumerate(TOKEN_CONTRACTS):
            logs.append({"address": contract, "blockHash": block["hash"], "transactionHash": tx_hash,
                         "logIndex": hex(index), "topics": [TRANSFER_TOPIC, "0x" + "0" * 24 + "1" * 40, "0x" + "0" * 24 + "2" * 40],
                         "data": "0x" + format(100 + index, "064x")})
        receipt = {**base, "logs": logs + [{**logs[0], "address": "0x" + "f" * 40}]}
        outputs = erc20_transfers(block, receipt)
        self.assertEqual(len(outputs), 2)
        self.assertEqual({item.asset_id for item in outputs}, {"erc20:" + contract for contract in TOKEN_CONTRACTS})
        self.assertEqual(outputs[0].amount_base_units, 100)
        logs[0]["removed"] = True
        with self.assertRaises(ValueError):
            erc20_transfers(block, receipt)

    def test_erc20_mint_is_not_a_wallet_to_wallet_transfer(self):
        block = {"hash": "0x" + "a" * 64, "number": "0x2a"}
        tx_hash = "0x" + "b" * 64
        log = {"address": next(iter(TOKEN_CONTRACTS)), "blockHash": block["hash"], "transactionHash": tx_hash,
               "logIndex": "0x0", "topics": [TRANSFER_TOPIC, "0x" + "0" * 64, "0x" + "0" * 24 + "2" * 40],
               "data": "0x" + format(100, "064x")}
        self.assertEqual(erc20_transfers(block, {"blockHash": block["hash"], "transactionHash": tx_hash, "status": "0x1", "logs": [log]}), [])

    def test_solana_balance_delta_is_not_a_transfer(self):
        row = {"accountIndex": 1, "mint": "A" * 44, "owner": "B" * 44, "programId": "D" * 44,
               "uiTokenAmount": {"amount": "100", "decimals": 2}}
        tx = {"slot": 123, "transaction": {"signatures": ["C" * 88]},
              "meta": {"err": None, "preTokenBalances": [row], "postTokenBalances": [{**row, "uiTokenAmount": {"amount": "130", "decimals": 2}}]}}
        observation = token_balance_deltas(tx)[0]
        self.assertEqual(observation.delta_base_units, 30)
        self.assertEqual(observation.classification, "balance_observation_not_transfer")
        tx["meta"]["postTokenBalances"][0]["owner"] = "E" * 44
        with self.assertRaises(ValueError):
            token_balance_deltas(tx)


if __name__ == "__main__":
    unittest.main()
