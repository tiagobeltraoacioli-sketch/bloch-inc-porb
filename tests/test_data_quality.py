import json
import tempfile
import unittest
from datetime import datetime, timezone
from pathlib import Path

from service.bloch_backfill import write_private
from service.bitcoin_pilot import collect as collect_bitcoin, write_private as write_bitcoin
from service.data_quality import build_ledger, inspect_bloch_sample, write_private as write_ledger
from service.ethereum_pilot import collect as collect_ethereum, write_private as write_ethereum
from tests.test_ethereum_pilot import fixture as ethereum_fixture
from tests.test_bitcoin_pilot import source as bitcoin_source


def fixture(folder, *, duplicate=False, wrong_value=False):
    manifest = {
        "status": "bounded_private_research_sample",
        "source_id": "bloch-historical-indexer",
        "retrieved_at": "2026-09-23T00:00:00Z",
        "snapshot_height": 10,
        "snapshot_slot": 20,
        "reported_finalized_height": 10,
        "pages": 1,
        "finalized_transactions": 2,
        "created_outputs": 1,
        "spent_outpoint_observations": 2 if duplicate else 1,
        "source_complete": False,
    }
    records = [
        {
            "record_type": "created_output_observation", "source_id": "bloch-historical-indexer",
            "tx_id": "a" * 64, "event_index": 0, "script_hash": "c" * 64,
            "value_sat": "100", "sender_ownership_asserted": False,
        },
        {
            "record_type": "spent_outpoint_observation", "source_id": "bloch-historical-indexer",
            "spending_tx_id": "b" * 64, "prior_tx_id": "a" * 64,
            "prior_vout": 0, "prior_script_hash": "c" * 64,
            "value_sat": "99" if wrong_value else "100", "height": 10,
            "sender_ownership_asserted": False,
        },
    ]
    if duplicate:
        records.append(dict(records[-1], input_index=1))
    write_private(manifest, records, folder)


class DataQualityTest(unittest.TestCase):
    def test_reconciles_without_claiming_chain_coverage_or_attribution(self):
        with tempfile.TemporaryDirectory() as temporary:
            folder = Path(temporary)
            fixture(folder)
            health = folder / "chain-health.json"
            health.write_text(json.dumps({"kind": "public_source_health_only", "retrieved_at": "2026-09-23T00:00:00Z", "sources": {
                "ethereum": {"status": "reachable", "reported_finalized_height": 123},
                "bitcoin": {"status": "reachable", "reported_tip_height": 456},
            }}))
            ledger = build_ledger(bloch_sample_dir=folder, chain_health_path=health,
                                  as_of=datetime(2026, 9, 23, 0, 1, tzinfo=timezone.utc))
            self.assertEqual(len(ledger["assets"]), 5)
            self.assertEqual([entry["status"] for entry in ledger["assets"]],
                             ["height_probe_only", "height_probe_only", "height_probe_only",
                              "height_probe_only", "bounded_private_sample"])
            bloch = ledger["assets"][-1]["private_sample"]
            self.assertEqual(bloch["within_sample_resolved_outpoints"], 1)
            self.assertEqual(bloch["quality_gate"], "pass")
            self.assertFalse(bloch["chain_history_complete"])
            self.assertFalse(ledger["production_ready"])
            self.assertEqual(ledger["assets"][0]["freshness"]["age_seconds"], 60)
            self.assertEqual(ledger["assets"][2]["token_log_ingestion"], "none")
            self.assertIsNone(ledger["assets"][2]["completeness"]["chain_transaction_coverage_fraction"])
            self.assertEqual(ledger["assets"][-1]["reorg_replay"], "not_implemented")
            self.assertNotIn("a" * 64, json.dumps(ledger))
            destination = folder / "private" / "ledger.json"
            write_ledger(ledger, destination)
            self.assertEqual(destination.stat().st_mode & 0o777, 0o600)

    def test_inconsistent_and_duplicate_spends_require_review(self):
        with tempfile.TemporaryDirectory() as temporary:
            folder = Path(temporary)
            fixture(folder, duplicate=True, wrong_value=True)
            report = inspect_bloch_sample(folder)
            self.assertEqual(report["within_sample_inconsistent_outpoints"], 2)
            self.assertEqual(report["duplicate_spent_outpoints"], 1)
            self.assertEqual(report["quality_gate"], "review_required")

    def test_digest_mismatch_fails_closed(self):
        with tempfile.TemporaryDirectory() as temporary:
            folder = Path(temporary)
            fixture(folder)
            (folder / "bloch-sample.jsonl").write_text("tampered\n")
            with self.assertRaisesRegex(ValueError, "digest mismatch"):
                inspect_bloch_sample(folder)

    def test_verified_digest_does_not_excuse_malformed_base_units(self):
        with tempfile.TemporaryDirectory() as temporary:
            folder = Path(temporary)
            fixture(folder)
            manifest = json.loads((folder / "bloch-sample-manifest.json").read_text())
            records = [json.loads(line) for line in (folder / "bloch-sample.jsonl").read_text().splitlines()]
            records[0]["value_sat"] = "1.5"
            write_private(manifest, records, folder)
            with self.assertRaisesRegex(ValueError, "invalid created output structure"):
                inspect_bloch_sample(folder)

    def test_missing_sources_are_unavailable(self):
        ledger = build_ledger()
        self.assertTrue(all(entry["status"] == "unavailable" for entry in ledger["assets"]))
        self.assertTrue(all(entry["amounts_are_exact_integers"] is None for entry in ledger["assets"]))

    def test_ethereum_pilot_is_verified_per_asset_without_chain_coverage(self):
        with tempfile.TemporaryDirectory() as temporary:
            folder = Path(temporary) / "ethereum"
            manifest, records = collect_ethereum(limit=2, fetch=ethereum_fixture, rpc_url="https://rpc.example.invalid")
            write_ethereum(manifest, records, folder)
            ledger = build_ledger(ethereum_pilot_dir=folder,
                                  as_of=datetime(2026, 9, 23, tzinfo=timezone.utc))
            eth, usdt, usdc = ledger["assets"][1:4]
            self.assertEqual([row["status"] for row in (eth, usdt, usdc)], ["bounded_private_sample"] * 3)
            self.assertEqual([row["completeness"]["sampled_asset_movements"] for row in (eth, usdt, usdc)], [1, 1, 0])
            self.assertEqual(usdt["token_log_ingestion"], "bounded_private_sample_only")
            self.assertIsNone(usdt["completeness"]["chain_transaction_coverage_fraction"])
            self.assertNotIn(records[0]["tx_id"], json.dumps(ledger))
            (folder / "ethereum-pilot.jsonl").write_text("tampered\n")
            with self.assertRaisesRegex(ValueError, "digest mismatch"):
                build_ledger(ethereum_pilot_dir=folder)

    def test_ethereum_pilot_rejects_rehashed_cross_block_movement(self):
        with tempfile.TemporaryDirectory() as temporary:
            folder = Path(temporary) / "ethereum"
            manifest, records = collect_ethereum(limit=2, fetch=ethereum_fixture)
            movement = next(row for row in records if row["record_type"] == "normalized_movement")
            movement["block_ref"] = "0x" + "f" * 64
            write_ethereum(manifest, records, folder)
            with self.assertRaisesRegex(ValueError, "invalid Ethereum normalized movement"):
                build_ledger(ethereum_pilot_dir=folder)

    def test_bitcoin_pilot_ledger_keeps_outputs_without_sender_or_coverage(self):
        with tempfile.TemporaryDirectory() as temporary:
            path = Path(temporary) / "bitcoin-pilot.json"
            get, _ = bitcoin_source()
            sample = collect_bitcoin(min_confirmations=6, tx_limit=2, get=get)
            write_bitcoin(sample, path)
            ledger = build_ledger(bitcoin_pilot_path=path,
                                  as_of=datetime(2026, 9, 23, tzinfo=timezone.utc))
            btc = ledger["assets"][0]
            self.assertEqual(btc["status"], "bounded_private_sample")
            self.assertEqual(btc["completeness"]["sampled_outputs"], 3)
            self.assertEqual(btc["private_sample"]["sampled_spent_outpoint_references"], 1)
            self.assertFalse(ledger["production_ready"])
            self.assertNotIn(sample["transactions"][0]["txid"], json.dumps(ledger))
            sample["transactions"][1]["single_sender_inferred"] = True
            path.write_text(json.dumps(sample))
            with self.assertRaisesRegex(ValueError, "invalid Bitcoin pilot transaction"):
                build_ledger(bitcoin_pilot_path=path)


if __name__ == "__main__":
    unittest.main()
