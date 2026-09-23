import json
import os
import tempfile
import unittest
from pathlib import Path

from service.bloch_backfill import write_private
from service.bloch_query_index import build_index, query_outpoint, query_script


A, B, C, D = (letter * 64 for letter in "abcd")


def fixture(folder):
    manifest = {
        "status": "bounded_private_research_sample", "source_id": "bloch-historical-indexer",
        "retrieved_at": "2026-09-23T00:00:00Z", "snapshot_height": 12,
        "snapshot_slot": 22, "reported_finalized_height": 12, "source_complete": False,
        "finalized_transactions": 2, "created_outputs": 2, "spent_outpoint_observations": 2,
    }
    base = {"source_id": "bloch-historical-indexer", "sender_ownership_asserted": False}
    records = [
        dict(base, record_type="created_output_observation", chain="bloch", network="genesis4-mainnet",
             asset_id="blch", tx_id=A, event_index=0, block_ref=B, slot=20, finality="finalized",
             value_sat="100", script_hash=C),
        dict(base, record_type="created_output_observation", chain="bloch", network="genesis4-mainnet",
             asset_id="blch", tx_id=A, event_index=1, block_ref=B, slot=20, finality="finalized",
             value_sat="50", script_hash=D),
        dict(base, record_type="spent_outpoint_observation", spending_tx_id=B, input_index=0,
             prior_tx_id=A, prior_vout=0, prior_script_hash=C, value_sat="100",
             block_id=D, height=11, slot=21),
        dict(base, record_type="spent_outpoint_observation", spending_tx_id=B, input_index=1,
             prior_tx_id=D, prior_vout=2, prior_script_hash=C, value_sat="75",
             block_id=D, height=11, slot=21),
    ]
    write_private(manifest, records, folder)
    return records


class BlochQueryIndexTest(unittest.TestCase):
    def test_private_index_and_bounded_queries_keep_observation_semantics(self):
        with tempfile.TemporaryDirectory() as temporary:
            sample, index = Path(temporary) / "sample", Path(temporary) / "private" / "query.sqlite"
            fixture(sample)
            metadata = build_index(sample, index)
            self.assertEqual(metadata["record_count"], 4)
            self.assertFalse(metadata["chain_history_complete"])
            self.assertEqual(os.stat(index).st_mode & 0o777, 0o600)
            first = query_script(index, C, limit=2)
            self.assertEqual([row["record_type"] for row in first["observations"]],
                             ["created_output_observation", "spent_outpoint_observation"])
            self.assertIsNotNone(first["next_cursor"])
            second = query_script(index, C, limit=2, cursor=first["next_cursor"])
            self.assertEqual(len(second["observations"]), 1)
            self.assertIsNone(second["next_cursor"])
            self.assertEqual(second["observations"][0]["outpoint_tx_id"], D)
            linked = query_outpoint(index, A, 0)
            self.assertEqual(len(linked["observations"]), 2)
            self.assertEqual(linked["linkage"], "within_sample_candidate_only")
            self.assertEqual(linked["outpoint_evidence"]["status"], "consistent_creation_and_spend_observations")
            self.assertEqual(linked["outpoint_evidence"]["created_source_line"], 1)
            self.assertFalse(linked["outpoint_evidence"]["sender_ownership_inferred"])
            self.assertEqual(linked["provenance"]["source_id"], "bloch-historical-indexer")
            self.assertEqual(query_outpoint(index, A, 0, limit=1)["outpoint_evidence"], linked["outpoint_evidence"])
            self.assertEqual(query_outpoint(index, A, 1)["outpoint_evidence"]["status"],
                             "creation_only_spend_not_in_sample")
            self.assertEqual(query_outpoint(index, D, 2)["outpoint_evidence"]["status"],
                             "spend_only_creation_not_in_sample")
            self.assertEqual(query_outpoint(index, C, 99)["outpoint_evidence"]["status"],
                             "outpoint_not_observed")

    def test_outpoint_evidence_flags_conflicting_and_multiple_spend_observations(self):
        with tempfile.TemporaryDirectory() as temporary:
            sample, index = Path(temporary) / "sample", Path(temporary) / "query.sqlite"
            records = fixture(sample)
            manifest = json.loads((sample / "bloch-sample-manifest.json").read_text())
            records[2]["value_sat"] = "101"
            write_private(manifest, records, sample)
            build_index(sample, index)
            evidence = query_outpoint(index, A, 0)["outpoint_evidence"]
            self.assertEqual(evidence["status"], "conflicting_observations")
            self.assertEqual(evidence["script_or_amount_mismatch_count"], 1)
            records[2]["value_sat"] = "100"
            records[2]["slot"] = 19
            write_private(manifest, records, sample)
            build_index(sample, index)
            evidence = query_outpoint(index, A, 0)["outpoint_evidence"]
            self.assertEqual(evidence["status"], "conflicting_observations")
            self.assertEqual(evidence["spend_precedes_creation_slot_count"], 1)
            records[2]["slot"] = 21
            records[3]["prior_tx_id"] = A
            records[3]["prior_vout"] = 0
            records[3]["prior_script_hash"] = C
            records[3]["value_sat"] = "100"
            write_private(manifest, records, sample)
            build_index(sample, index)
            evidence = query_outpoint(index, A, 0, limit=1)["outpoint_evidence"]
            self.assertEqual(evidence["status"], "multiple_spend_observations")
            self.assertEqual(evidence["spent_observation_count"], 2)

    def test_bad_digest_fails_before_replacing_existing_index(self):
        with tempfile.TemporaryDirectory() as temporary:
            sample, index = Path(temporary) / "sample", Path(temporary) / "query.sqlite"
            fixture(sample)
            build_index(sample, index)
            previous = index.read_bytes()
            with (sample / "bloch-sample.jsonl").open("ab") as handle:
                handle.write(b"tampered\n")
            with self.assertRaisesRegex(ValueError, "digest"):
                build_index(sample, index)
            self.assertEqual(index.read_bytes(), previous)

    def test_rejects_unfinalized_or_attributed_observation(self):
        with tempfile.TemporaryDirectory() as temporary:
            sample, index = Path(temporary) / "sample", Path(temporary) / "query.sqlite"
            records = fixture(sample)
            manifest = json.loads((sample / "bloch-sample-manifest.json").read_text())
            records[2]["height"] = 13
            write_private(manifest, records, sample)
            with self.assertRaisesRegex(ValueError, "finalized"):
                build_index(sample, index)
            records[2]["height"] = 11
            records[2]["sender_ownership_asserted"] = True
            write_private(manifest, records, sample)
            with self.assertRaisesRegex(ValueError, "attribution"):
                build_index(sample, index)

    def test_query_inputs_are_bounded_and_exact(self):
        with tempfile.TemporaryDirectory() as temporary:
            sample, index = Path(temporary) / "sample", Path(temporary) / "query.sqlite"
            fixture(sample)
            build_index(sample, index)
            for limit in (0, 101, True):
                with self.assertRaises(ValueError):
                    query_script(index, C, limit=limit)
            for cursor in (-1, True):
                with self.assertRaises(ValueError):
                    query_script(index, C, cursor=cursor)
            with self.assertRaises(ValueError):
                query_script(index, "not-a-hash")
            with self.assertRaises(ValueError):
                query_outpoint(index, A, -1)


if __name__ == "__main__":
    unittest.main()
