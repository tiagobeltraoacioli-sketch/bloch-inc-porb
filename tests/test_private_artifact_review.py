"""Private ranking files need a second, data-only release check."""

import hashlib
import json
import os
import tempfile
import unittest
from pathlib import Path

from service.bitcoin_snapshot_job import CONVERTER_SHA256 as SNAPSHOT_CONVERTER_SHA256
from service.ethereum_token_candidates import CONTRACTS as SCANNER_CONTRACTS
from service.private_artifact_review import CONTRACTS, CONVERTER_SHA256, inspect


class PrivateArtifactReviewTests(unittest.TestCase):
    def test_standalone_review_constants_match_collectors(self):
        self.assertEqual(CONVERTER_SHA256, SNAPSHOT_CONVERTER_SHA256)
        self.assertEqual(CONTRACTS, SCANNER_CONTRACTS)

    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.path = Path(self.temp.name) / "top64.json"

    def write(self, document):
        self.path.write_text(json.dumps(document))
        os.chmod(self.path, 0o600)

    def bitcoin(self):
        first = "0014" + "11" * 20
        second = "5120" + "22" * 32
        return {"kind": "bitcoin_mainnet_utxo_script_ranking", "asset": "BTC",
                "network": "bitcoin-mainnet", "base_height": 100,
                "base_hash": "a" * 64, "snapshot_sha256": "b" * 64,
                "converter_sha256": CONVERTER_SHA256,
                "snapshot_coin_count": 3, "snapshot_total_sats": "1350",
                "coverage": "all_confirmed_utxos_in_one_validated_snapshot",
                "network_wide_script_discovery_complete": True,
                "independent_snapshot_verification": False,
                "publication_status": "private_pending_review",
                "generated_at": "2026-09-24T10:00:00Z",
                "rows": [{"rank": index, "scriptpubkey": script,
                          "scriptpubkey_sha256": hashlib.sha256(bytes.fromhex(script)).hexdigest(),
                          "address": None, "utxo_count": 2 if index == 1 else 1,
                          "amount_base_units": amount, "unit": "sat"}
                         for index, (script, amount) in enumerate(
                             ((first, "700"), (second, "650")), 1)]}

    def token(self):
        return {"kind": "private_event_discovered_token_balance_ranking",
                "asset": "USDC", "network": "ethereum-mainnet",
                "contract": CONTRACTS["USDC"], "block_height": 100,
                "block_hash": "0x" + "a" * 64, "event_candidate_count": 3,
                "transfer_history_scan_complete": True,
                "same_block_balance_reads_complete": True,
                "network_wide_holder_discovery_complete": False,
                "independent_balance_verification": False,
                "publication_status": "private_pending_review",
                "generated_at": "2026-09-24T10:00:00Z",
                "rows": [{"rank": 1, "address": "0x" + "1" * 40,
                          "amount_base_units": "1000", "unit": "token-base-unit"},
                         {"rank": 2, "address": "0x" + "2" * 40,
                          "amount_base_units": "999", "unit": "token-base-unit"}]}

    def test_valid_artifacts_are_review_ready_but_never_public_ready(self):
        for asset, document in (("BTC", self.bitcoin()), ("USDC", self.token())):
            self.write(document)
            result = inspect(self.path, asset=asset)
            self.assertTrue(result["private_review_ready"])
            self.assertFalse(result["public_release_ready"])
            self.assertEqual(result["record_count"], 2)
            self.assertEqual(len(result["artifact_sha256"]), 64)

    def test_corrupt_provenance_or_order_fails_closed(self):
        document = self.bitcoin()
        document["rows"][0]["scriptpubkey_sha256"] = "f" * 64
        self.write(document)
        with self.assertRaisesRegex(ValueError, "script row"):
            inspect(self.path, asset="BTC")
        document = self.token()
        document["rows"][1]["amount_base_units"] = "1001"
        self.write(document)
        with self.assertRaisesRegex(ValueError, "ranking order"):
            inspect(self.path, asset="USDC")
        document["rows"][1]["amount_base_units"] = "999"
        document["same_block_balance_reads_complete"] = False
        self.write(document)
        with self.assertRaisesRegex(ValueError, "provenance"):
            inspect(self.path, asset="USDC")

    def test_world_readable_artifact_is_rejected(self):
        self.write(self.token())
        os.chmod(self.path, 0o644)
        with self.assertRaisesRegex(ValueError, "mode or size"):
            inspect(self.path, asset="USDC")


if __name__ == "__main__":
    unittest.main()
