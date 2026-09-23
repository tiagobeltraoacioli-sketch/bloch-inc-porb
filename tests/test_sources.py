import unittest
from datetime import datetime
from unittest.mock import patch

from service.ofac import parse_identifiers, public_status, screen_identifier
from service.privacy import reduce_ip_observation, tenant_pseudonym
from service.normalization import Movement, bitcoin_output
from service.graph import EvidenceEdge, EvidenceGraph
from service.bloch import normalized_outputs


class SourceTest(unittest.TestCase):
    def test_ofac_parser_keeps_only_identifiers(self):
        source = {
            "sdn.csv": b'123,"Example Person",-0- ,"Digital Currency Address - XBT 1Archive1n2C579dMsAu3iC6tWzuQJz8dN"\n',
            "sdn_comments.csv": b'123,"Digital Currency Address - ETH 0xd5ED34b52AC4ab84d8FA8A231a3218bbF01Ed510"\n',
        }
        records, counts = parse_identifiers(source)
        self.assertEqual(len(records), 2)
        self.assertFalse(any("Example Person" in str(record) for record in records))
        status = public_status({"retrieved_at": "2026-09-23T00:00:00Z", "combined_sha256": "a" * 64}, records, counts)
        self.assertEqual(status["wallets_or_people_screened"], 0)
        self.assertEqual(status["bloch_blch_identifiers"], 0)

    def test_exact_match_is_only_a_review_signal(self):
        snapshot = {"combined_sha256": "b" * 64, "retrieved_at": "2026-09-23T00:00:00Z"}
        records = {("123", "XBT", "1Archive1n2C579dMsAu3iC6tWzuQJz8dN")}
        with patch("service.ofac.load", return_value=(snapshot, records)):
            hit = screen_identifier("XBT", "1Archive1n2C579dMsAu3iC6tWzuQJz8dN")
            miss = screen_identifier("XBT", "1Archive1n2C579dMsAu3iC6tWzuQJz8dM")
        self.assertEqual(hit["result"], "potential_exact_identifier_match")
        self.assertTrue(hit["review_required"])
        self.assertEqual(miss["result"], "no_exact_identifier_match_in_snapshot")
        self.assertFalse(miss["review_required"])

    def test_pseudonyms_are_scoped_and_ip_is_discarded(self):
        key = b"x" * 32
        self.assertNotEqual(tenant_pseudonym(key, "wallet", "wallet1"), tenant_pseudonym(key, "network_event", "wallet1"))
        output = reduce_ip_observation("8.8.8.8", "US", "approved-source", "2026-09-22T12:00:00Z")
        self.assertNotIn("8.8.8.8", str(output))
        self.assertFalse(output["decision_allowed"])
        with self.assertRaises(ValueError):
            reduce_ip_observation("127.0.0.1", "US", "approved-source", "2026-09-22T12:00:00Z")

    def test_chain_asset_isolation_and_no_bitcoin_sender_claim(self):
        output = bitcoin_output(network="mainnet", tx_id="a" * 64, vout=0, block_hash="b" * 64, height=100, value_sats=5000, destination="bc1sample", source_id="bitcoin-core")
        self.assertIsNone(output.sender)
        self.assertEqual(output.sender_attribution, "unknown")
        other = Movement("bloch", "mainnet", "blch", "a" * 64, 0, "b" * 64, 100, "finalized", 5000, "sample", "source", "direct", "bloch-indexer")
        self.assertNotEqual(output.key, other.key)
        self.assertFalse(output.score_eligible)
        self.assertTrue(other.score_eligible)

    def test_graph_requires_bridge_proof_and_labels_paths_as_associations(self):
        graph = EvidenceGraph()
        with self.assertRaises(ValueError):
            graph.add(EvidenceEdge("bad", "bloch:a", "eth:b", "verified_bridge_flow", "bridge", "2026-09-22T00:00:00Z", "2026-09-25T00:00:00Z", 0.9, True))
        graph.add(EvidenceEdge("e1", "bloch:a", "eth:b", "verified_bridge_flow", "bridge", "2026-09-22T00:00:00Z", "2026-09-25T00:00:00Z", 0.9, True, "receipt-1"))
        graph.add(EvidenceEdge("e2", "eth:b", "eth:listed", "value_flow", "ethereum-node", "2026-09-22T00:00:00Z", "2026-09-25T00:00:00Z", 1, True))
        paths = graph.trace_to_anchors("bloch:a", {"eth:listed"})
        self.assertEqual(paths[0]["classification"], "association_only")
        self.assertEqual(paths[0]["edge_ids"], ["e1", "e2"])
        self.assertTrue(paths[0]["review_required"])

    def test_graph_rejects_reverse_time_and_future_paths(self):
        graph = EvidenceGraph()
        graph.add(EvidenceEdge("first", "a", "b", "value_flow", "chain", "2026-09-22T12:00:00Z", "2026-09-25T00:00:00Z", 1, True))
        graph.add(EvidenceEdge("older", "b", "listed", "value_flow", "chain", "2026-09-22T10:00:00Z", "2026-09-25T00:00:00Z", 1, True))
        self.assertEqual(graph.trace_to_anchors("a", {"listed"}), [])
        self.assertEqual(graph.trace_to_anchors("a", {"b"}, as_of=datetime.fromisoformat("2026-09-22T11:00:00+00:00")), [])

    def test_bloch_adapter_uses_reported_finality_and_keeps_sender_unknown(self):
        tx = {"txid": "a" * 64, "block_id": "b" * 64, "slot": 900, "height": 800,
              "outputs": [{"value_sat": "5000", "script_hash": "c" * 64}]}
        self.assertEqual(normalized_outputs(tx, 799), [])
        output = normalized_outputs(tx, 800)[0]
        self.assertEqual(output.amount_base_units, 5000)
        self.assertIsNone(output.sender)
        self.assertEqual(output.finality, "finalized")


if __name__ == "__main__":
    unittest.main()
