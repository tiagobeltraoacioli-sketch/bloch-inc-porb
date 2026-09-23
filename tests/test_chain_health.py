import unittest
from unittest.mock import patch

from service import chain_health


class ChainHealthTest(unittest.TestCase):
    def test_ethereum_finalized_block_validation(self):
        with patch.object(chain_health, "fetch_json_rpc", return_value={"number": "0x2a", "hash": "0x" + "a" * 64}):
            self.assertEqual(chain_health.ethereum()["reported_finalized_height"], 42)
        with patch.object(chain_health, "fetch_json_rpc", return_value={"number": "0x2a", "hash": "bad"}):
            with self.assertRaises(ValueError):
                chain_health.ethereum()

    def test_solana_finalized_slot_validation(self):
        with patch.object(chain_health, "fetch_json_rpc", return_value=42):
            self.assertEqual(chain_health.solana()["reported_finalized_slot"], 42)
        with patch.object(chain_health, "fetch_json_rpc", return_value=True):
            with self.assertRaises(ValueError):
                chain_health.solana()


if __name__ == "__main__":
    unittest.main()
