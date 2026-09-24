"""Sampled address rankings must preserve exact amounts and coverage boundaries."""

import json
import tempfile
import unittest
from pathlib import Path

from service.holder_candidate_index import build_index, top_candidates


BTC = "bc1qxy2kgdygjrsqtzq2n0yrf2493p83kkfjhx0wlh"
ETH_ONE = "0x" + "0" * 39 + "1"
ETH_TWO = "0x" + "0" * 39 + "2"
BLOCK_A = "0x" + "a" * 64
BLOCK_B = "0x" + "b" * 64
USDC = "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48"


def ethereum_record(address, amount, block=BLOCK_A, when="2026-09-23T12:00:00.000Z"):
    return {"status": "source-reported", "independent_verification": False,
            "network": "ethereum-mainnet", "asset": "USDC", "address": address,
            "balance": {"base_units": amount, "unit": "token-base-unit",
                        "scope": "source_reported_finalized_block",
                        "block": {"height": 23000000, "hash": block, "time": "2026-09-23T11:45:00.000Z"},
                        "contract": USDC, "decimals": 6},
            "observation": {"source_id": "configured-ethereum-json-rpc", "retrieved_at": when,
                            "coverage": "single_address_balance_at_source_reported_finalized_block"}}


def bitcoin_record(amount, when="2026-09-23T12:00:00.000Z"):
    return {"status": "source-reported", "independent_verification": False,
            "network": "bitcoin-mainnet", "asset": "BTC", "address": BTC,
            "balance": {"base_units": amount, "unit": "sat",
                        "scope": "source_confirmed_address_aggregate", "block": None},
            "observation": {"source_id": "blockstream-esplora", "retrieved_at": when,
                            "coverage": "first_page_up_to_8_confirmed_transactions"}}


class HolderCandidateIndexTests(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory()
        self.addCleanup(self.temporary.cleanup)
        self.root = Path(self.temporary.name)
        self.input = self.root / "lookups.jsonl"
        self.index = self.root / "index" / "holders.sqlite"

    def build(self, records):
        self.input.write_text("".join(json.dumps(record) + "\n" for record in records))
        return build_index(self.input, self.index)

    def test_exact_amounts_rank_within_one_eth_block_only(self):
        metadata = self.build([
            ethereum_record(ETH_ONE, "999999999999999999999999999999"),
            ethereum_record(ETH_TWO, "1000000000000000000000000000000"),
            ethereum_record(ETH_ONE, "2000000000000000000000000000000", BLOCK_B),
        ])
        self.assertEqual(metadata["candidate_count"], 3)
        first = top_candidates(self.index, asset="USDC", block_hash=BLOCK_A)
        self.assertEqual(first["sampled_address_count"], 2)
        self.assertEqual([row["address"] for row in first["rows"]], [ETH_TWO, ETH_ONE])
        self.assertEqual(first["rows"][0]["amount_base_units"], "1000000000000000000000000000000")
        self.assertFalse(first["network_wide_discovery_complete"])
        second = top_candidates(self.index, asset="USDC", block_hash=BLOCK_B)
        self.assertEqual([row["address"] for row in second["rows"]], [ETH_ONE])

    def test_latest_btc_observation_replaces_same_address_only(self):
        self.build([bitcoin_record("100", "2026-09-23T11:00:00.000Z"),
                    bitcoin_record("20", "2026-09-23T12:00:00.000Z")])
        result = top_candidates(self.index, asset="BTC")
        self.assertEqual(result["sampled_address_count"], 1)
        self.assertEqual(result["rows"][0]["amount_base_units"], "20")
        self.assertIn("separate retrieval times", result["comparability"])
        self.assertEqual(result["rows"][0]["selection"], "queried_address")

    def test_reject_unanchored_or_mismatched_claims_without_overwriting_index(self):
        self.build([bitcoin_record("5")])
        before = self.index.read_bytes()
        bad = ethereum_record(ETH_ONE, "9")
        bad["balance"]["contract"] = "0x" + "f" * 40
        with self.assertRaisesRegex(ValueError, "contract"):
            self.build([bad])
        self.assertEqual(before, self.index.read_bytes())
        bad = ethereum_record(ETH_ONE, "9")
        bad["balance"]["block"] = None
        with self.assertRaisesRegex(ValueError, "block"):
            self.build([bad])
        bad = bitcoin_record("5")
        bad["status"] = "synthetic"
        with self.assertRaisesRegex(ValueError, "source-reported"):
            self.build([bad])

    def test_eth_rank_requires_anchor_and_rejects_invalid_amount(self):
        self.build([ethereum_record(ETH_ONE, "0")])
        with self.assertRaisesRegex(ValueError, "block hash"):
            top_candidates(self.index, asset="USDC")
        with self.assertRaisesRegex(ValueError, "no common block"):
            top_candidates(self.index, asset="BTC", block_hash=BLOCK_A)
        invalid = ethereum_record(ETH_ONE, "1.5")
        with self.assertRaisesRegex(ValueError, "amount"):
            self.build([invalid])

    def test_same_block_hash_cannot_claim_conflicting_height(self):
        second = ethereum_record(ETH_TWO, "10")
        second["balance"]["block"]["height"] += 1
        with self.assertRaisesRegex(ValueError, "inconsistent Ethereum block anchor"):
            self.build([ethereum_record(ETH_ONE, "10"), second])


if __name__ == "__main__":
    unittest.main()
