import unittest

from service.graph_analytics import GraphAnalytics, TemporalEvent, events_from_movements, linear_trend
from service.normalization import Movement, bitcoin_output


def event(event_id, sender, destination, amount, day, *, chain="ethereum", network="mainnet", asset="eth", attribution="direct"):
    return TemporalEvent(event_id, chain, network, asset, sender, destination, amount,
                         f"2026-09-{day:02d}T12:00:00Z", "synthetic-fixture", "finalized", attribution)


class GraphAnalyticsTest(unittest.TestCase):
    def setUp(self):
        self.graph = GraphAnalytics([
            event("e1", "a", "b", 100, 1),
            event("e2", "b", "c", 60, 2),
            event("e3", "c", "d", 20, 3),
            event("e4", "b", "d", 40, 4),
            event("usdt1", "b", "c", 999, 2, asset="usdt"),
            event("btc1", None, "b", 500, 2, chain="bitcoin", asset="btc", attribution="unknown"),
        ])

    def test_public_features_are_asset_isolated_and_source_aware(self):
        report = self.graph.wallet_features(chain="ethereum", network="mainnet", asset_id="eth", wallet="b",
                                            start="2026-09-01T00:00:00Z", end="2026-09-06T00:00:00Z")
        self.assertEqual(report["features"]["event_count"], 3)
        self.assertEqual(report["features"]["inbound_base_units"], 100)
        self.assertEqual(report["features"]["outbound_base_units"], 100)
        self.assertEqual(report["features"]["distinct_direct_counterparties"], 3)
        self.assertEqual(report["source_ids"], ["synthetic-fixture"])
        self.assertNotIn("aml_score", str(report))
        self.assertEqual(sum(day["value"] for day in report["daily_volume_base_units"]), 200)

    def test_unknown_bitcoin_sender_never_becomes_counterparty_edge(self):
        report = self.graph.wallet_features(chain="bitcoin", network="mainnet", asset_id="btc", wallet="b",
                                            start="2026-09-01T00:00:00Z", end="2026-09-06T00:00:00Z")
        self.assertEqual(report["features"]["inbound_count"], 1)
        self.assertEqual(report["features"]["distinct_direct_counterparties"], 0)
        self.assertIsNone(report["features"]["largest_direct_counterparty_share"])
        self.assertEqual(self.graph.temporal_paths(chain="bitcoin", network="mainnet", asset_id="btc", source_wallet="a", target_wallet="b",
                                                    start="2026-09-01T00:00:00Z", end="2026-09-06T00:00:00Z"), [])

    def test_paths_follow_event_time_and_report_association_only(self):
        paths = self.graph.temporal_paths(chain="ethereum", network="mainnet", asset_id="eth", source_wallet="a", target_wallet="d",
                                          start="2026-09-01T00:00:00Z", end="2026-09-06T00:00:00Z")
        self.assertEqual(len(paths), 2)
        self.assertEqual(paths[0]["classification"], "temporal_association_only")
        self.assertFalse(paths[0]["value_continuity_proven"])
        reverse = GraphAnalytics([event("late", "a", "b", 10, 3), event("early", "b", "c", 10, 2)])
        self.assertEqual(reverse.temporal_paths(chain="ethereum", network="mainnet", asset_id="eth", source_wallet="a", target_wallet="c",
                                                start="2026-09-01T00:00:00Z", end="2026-09-06T00:00:00Z"), [])

    def test_duplicate_events_and_heuristic_sender_are_rejected(self):
        with self.assertRaises(ValueError):
            GraphAnalytics([event("same", "a", "b", 1, 1), event("same", "a", "c", 1, 1)])
        with self.assertRaises(ValueError):
            event("heuristic", "a", "b", 1, 1, attribution="heuristic")

    def test_regression_is_descriptive_with_explicit_sample_size(self):
        self.assertEqual(linear_trend([1, 2, 3, 4])["slope"], 1)
        self.assertEqual(linear_trend([1, 2, 3, 4])["r2"], 1)
        self.assertIsNone(linear_trend([1, 2])["slope"])

    def test_constellation_uses_event_nodes_and_direct_evm_sender_only(self):
        view = self.graph.wallet_constellation(
            chain="ethereum", network="mainnet", asset_id="eth", wallet="b",
            start="2026-09-01T00:00:00Z", end="2026-09-06T00:00:00Z",
        )
        self.assertEqual(view["summary"]["observed_events"], 3)
        self.assertEqual(view["summary"]["direct_sender_links"], 3)
        self.assertEqual(view["summary"]["source_event_counts"],
                         [{"source_id": "synthetic-fixture", "events": 3}])
        self.assertEqual({node["id"] for node in view["nodes"] if node["kind"] == "observed_event"},
                         {"event:e1", "event:e2", "event:e4"})
        self.assertEqual(len([link for link in view["links"] if link["kind"] == "direct_observed_sender"]), 3)
        self.assertNotIn("usdt1", str(view))
        self.assertEqual(view, GraphAnalytics(reversed(self.graph.events)).wallet_constellation(
            chain="ethereum", network="mainnet", asset_id="eth", wallet="b",
            start="2026-09-01T00:00:00Z", end="2026-09-06T00:00:00Z",
        ))

    def test_utxo_and_eutxo_constellation_has_no_sender_or_peer_claim(self):
        for chain, asset in (("bitcoin", "btc"), ("bloch", "blch")):
            with self.subTest(chain=chain):
                graph = GraphAnalytics([event("output-1", None, "script-1", 500, 2,
                                              chain=chain, asset=asset, attribution="unknown")])
                view = graph.wallet_constellation(
                    chain=chain, network="mainnet", asset_id=asset, wallet="script-1",
                    start="2026-09-01T00:00:00Z", end="2026-09-06T00:00:00Z",
                )
                self.assertEqual(view["summary"]["unknown_sender_events"], 1)
                self.assertEqual(view["summary"]["direct_sender_links"], 0)
                self.assertEqual([link["kind"] for link in view["links"]], ["observed_destination"])
                self.assertEqual([node["reference"] for node in view["nodes"]
                                  if node["kind"] == "chain_reference"], ["script-1"])
                with self.assertRaises(ValueError):
                    event("bad", "inferred-sender", "script-1", 500, 2, chain=chain, asset=asset)

    def test_constellation_rejects_silent_truncation_and_invalid_bounds(self):
        arguments = dict(chain="ethereum", network="mainnet", asset_id="eth", wallet="b",
                         start="2026-09-01T00:00:00Z", end="2026-09-06T00:00:00Z")
        with self.assertRaisesRegex(ValueError, "narrow the window"):
            self.graph.wallet_constellation(**arguments, max_events=2)
        for bound in (0, True, 501):
            with self.assertRaises(ValueError):
                self.graph.wallet_constellation(**arguments, max_events=bound)

    def test_normalized_movement_adapter_preserves_provenance_and_asset_scope(self):
        movements = [
            Movement("ethereum", "mainnet", "eth", "eth-tx", 0, "eth-block", 100,
                     "finalized", 30, "bob", "alice", "direct", "private-eth-pilot"),
            Movement("ethereum", "mainnet", "erc20:usdc", "eth-tx", 1, "eth-block", 100,
                     "finalized", 900, "bob", "alice", "direct", "private-eth-pilot"),
            bitcoin_output(network="mainnet", tx_id="btc-tx", vout=0,
                           block_hash="btc-block", height=200, value_sats=500,
                           destination="script-hash", source_id="private-btc-pilot"),
            Movement("bloch", "genesis4-mainnet", "blch", "blch-tx", 0,
                     "blch-block", 300, "finalized", 700, "blch-script", None,
                     "unknown", "private-blch-pilot"),
        ]
        times = {
            ("ethereum", "mainnet", "eth-block"): "2026-09-02T12:00:00+00:00",
            ("bitcoin", "mainnet", "btc-block"): "2026-09-03T12:00:00Z",
            ("bloch", "genesis4-mainnet", "blch-block"): "2026-09-04T12:00:00Z",
        }
        graph = GraphAnalytics.from_movements(movements, block_times=times)
        view = graph.wallet_constellation(
            chain="ethereum", network="mainnet", asset_id="eth", wallet="bob",
            start="2026-09-01T00:00:00Z", end="2026-09-06T00:00:00Z")
        self.assertEqual(view["summary"]["observed_events"], 1)
        observed = next(node for node in view["nodes"] if node["kind"] == "observed_event")
        self.assertEqual(observed["event_id"], movements[0].key)
        self.assertEqual(observed["transaction_id"], "eth-tx")
        self.assertEqual(observed["block_ref"], "eth-block")
        self.assertEqual(observed["observed_at"], "2026-09-02T12:00:00Z")
        self.assertEqual(observed["source_id"], "private-eth-pilot")
        self.assertNotIn("usdc", str(view))
        for chain, network, asset, wallet in (
            ("bitcoin", "mainnet", "btc", "script-hash"),
            ("bloch", "genesis4-mainnet", "blch", "blch-script"),
        ):
            with self.subTest(chain=chain):
                result = graph.wallet_constellation(
                    chain=chain, network=network, asset_id=asset, wallet=wallet,
                    start="2026-09-01T00:00:00Z", end="2026-09-06T00:00:00Z")
                self.assertEqual([edge["kind"] for edge in result["links"]],
                                 ["observed_destination"])
                self.assertEqual(result["summary"]["direct_sender_links"], 0)

    def test_movement_adapter_rejects_missing_time_unsafe_sender_and_duplicates(self):
        output = bitcoin_output(network="mainnet", tx_id="btc-tx", vout=0,
                                block_hash="btc-block", height=200, value_sats=500,
                                destination="script-hash", source_id="private-btc-pilot")
        times = {("bitcoin", "mainnet", "btc-block"): "2026-09-03T12:00:00Z"}
        with self.assertRaisesRegex(ValueError, "timestamp required"):
            events_from_movements([output], block_times={})
        with self.assertRaisesRegex(ValueError, "timezone"):
            events_from_movements([output], block_times={times.popitem()[0]: "2026-09-03T12:00:00"})
        times = {("bitcoin", "mainnet", "btc-block"): "2026-09-03T12:00:00Z"}
        with self.assertRaisesRegex(ValueError, "duplicate"):
            GraphAnalytics.from_movements([output, output], block_times=times)
        with self.assertRaisesRegex(ValueError, "event bound"):
            GraphAnalytics.from_movements([output, output], block_times=times, max_events=1)
        attributed = Movement("bitcoin", "mainnet", "btc", "btc-tx", 0,
                              "btc-block", 200, "confirmed", 500, "script-hash",
                              "alice", "direct", "private-btc-pilot")
        with self.assertRaisesRegex(ValueError, "UTXO"):
            events_from_movements([attributed], block_times=times)
        heuristic = Movement("ethereum", "mainnet", "eth", "eth-tx", 0,
                             "eth-block", 1, "finalized", 1, "bob", "alice",
                             "heuristic", "private-eth-pilot")
        with self.assertRaisesRegex(ValueError, "heuristic"):
            events_from_movements([heuristic], block_times={
                ("ethereum", "mainnet", "eth-block"): "2026-09-03T12:00:00Z"})


if __name__ == "__main__":
    unittest.main()
