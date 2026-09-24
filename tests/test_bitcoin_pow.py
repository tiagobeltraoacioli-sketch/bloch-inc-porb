import unittest

from service.bitcoin_pow import MAINNET_POW_LIMIT, check_header_pow, compact_target


GENESIS_HEADER = (
    "0100000000000000000000000000000000000000000000000000000000000000"
    "000000003ba3edfd7a7b12b27ac72c3e67768f617fc81bc3888a51323a9fb8aa4b1e5e4a"
    "29ab5f49ffff001d1dac2b7c"
)
GENESIS_HASH = "000000000019d6689c085ae165831e934ff763ae46a2a6c172b3f1b60a8ce26f"


class BitcoinPowTest(unittest.TestCase):
    def test_genesis_header_meets_target(self):
        work = check_header_pow(GENESIS_HEADER)
        self.assertEqual(work["block_hash"], GENESIS_HASH)
        self.assertEqual(work["n_bits_hex"], "1d00ffff")
        self.assertLessEqual(int(GENESIS_HASH, 16), int(work["target_hex"], 16))
        self.assertLessEqual(int(work["target_hex"], 16), MAINNET_POW_LIMIT)

    def test_invalid_targets_and_insufficient_work_fail_closed(self):
        for bits in (0, 0x1d80ffff, 0x2300ffff, 0x1e00ffff):
            with self.assertRaisesRegex(ValueError, "target invalid"):
                compact_target(bits)
        mutated = GENESIS_HEADER[:-8] + "1eac2b7c"
        with self.assertRaisesRegex(ValueError, "exceeds claimed work target"):
            check_header_pow(mutated)
        with self.assertRaisesRegex(ValueError, "header length"):
            check_header_pow("00")


if __name__ == "__main__":
    unittest.main()
