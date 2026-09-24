"""Bounded real observations must not silently become wallet balance claims."""

import tempfile
import unittest
from pathlib import Path

from service.bitcoin_pilot import collect as collect_bitcoin, write_private as write_bitcoin
from service.bitcoin_query_index import build_index as build_bitcoin, query_output_address
from service.ethereum_pilot import collect as collect_ethereum, write_private as write_ethereum
from service.ethereum_query_index import build_index as build_ethereum, query_address
from service.bloch_backfill import write_private as write_bloch
from service.bloch_query_index import build_index as build_bloch, query_script
from tests.test_bitcoin_pilot import source as bitcoin_source
from tests.test_bloch_query_index import C, fixture as bloch_fixture
from tests.test_ethereum_pilot import fixture as ethereum_fixture


class RealDataBoundaryTest(unittest.TestCase):
    def test_bitcoin_sampled_output_is_not_an_unspent_balance(self):
        with tempfile.TemporaryDirectory() as directory:
            pilot = Path(directory) / "pilot" / "bitcoin-block-pilot.json"
            get, _ = bitcoin_source()
            write_bitcoin(collect_bitcoin(min_confirmations=6, tx_limit=2, get=get), pilot)
            index = Path(directory) / "private" / "bitcoin.sqlite"
            evidence = build_bitcoin(pilot, index)
            result = query_output_address(index, "bc1qexampleaddress00000000000000000")
            self.assertEqual(result["observations"][0]["value_sat"], "25")
            self.assertFalse(evidence["unspent_status_queried"])
            self.assertFalse(evidence["chain_history_complete"])
            self.assertFalse(evidence["sender_ownership_inferred"])
            self.assertFalse(any("balance" in key or "held" in key for key in result))

    def test_ethereum_sampled_transfer_is_not_account_or_token_balance(self):
        with tempfile.TemporaryDirectory() as directory:
            sample = Path(directory) / "sample"
            manifest, records = collect_ethereum(
                limit=2, fetch=ethereum_fixture, rpc_url="https://rpc.example.invalid/secret")
            write_ethereum(manifest, records, sample)
            index = Path(directory) / "private" / "ethereum.sqlite"
            evidence = build_ethereum(sample, index)
            destination = "0x" + "2" * 40
            usdt = query_address(index, destination, asset="usdt", direction="incoming")
            eth = query_address(index, destination, asset="eth", direction="incoming")
            self.assertEqual(usdt["movements"][0]["amount_base_units"], "25")
            self.assertEqual(len(eth["movements"]), 1)
            self.assertNotEqual(usdt["movements"][0]["asset_id"], eth["movements"][0]["asset_id"])
            self.assertFalse(evidence["chain_history_complete"])
            self.assertFalse(evidence["independent_finality_reconciled"])
            self.assertFalse(any("balance" in key or "held" in key for key in usdt))

    def test_bloch_paginated_sample_is_not_complete_eutxo_state(self):
        with tempfile.TemporaryDirectory() as directory:
            sample = Path(directory) / "sample"
            records = bloch_fixture(sample)
            # Exhausting this small bounded source cursor still cannot prove history.
            from json import loads
            manifest = loads((sample / "bloch-sample-manifest.json").read_text())
            manifest["source_complete"] = True
            write_bloch(manifest, records, sample)
            index = Path(directory) / "private" / "bloch.sqlite"
            evidence = build_bloch(sample, index)
            result = query_script(index, C)
            self.assertTrue(evidence["source_complete"])
            self.assertFalse(evidence["chain_history_complete"])
            self.assertEqual(result["observations"][0]["record_type"], "created_output_observation")
            self.assertFalse(any("balance" in key or "held" in key for key in result))


if __name__ == "__main__":
    unittest.main()
