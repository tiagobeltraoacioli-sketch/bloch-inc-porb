import json
import subprocess
import unittest
from datetime import datetime, timezone

from service.chain_node_status import (BTC_ARTIFACT, BTC_INFO, ETH_ARTIFACTS, ETH_DISK,
                                       ETH_LOGS, ETH_SYNC, _ethereum, collect)


class ChainNodeStatusTest(unittest.TestCase):
    def test_reports_sync_without_claiming_holder_readiness(self):
        replies = {
            BTC_INFO: subprocess.CompletedProcess(BTC_INFO, 0, json.dumps({
                "chain": "main", "blocks": 771556, "headers": 968382,
                "verificationprogress": 0.5625, "initialblockdownload": True}), ""),
            ETH_SYNC: subprocess.CompletedProcess(ETH_SYNC, 0, json.dumps({
                "jsonrpc": "2.0", "id": 1, "result": {"currentBlock": "0x0",
                    "highestBlock": "0x18d1457"}}), ""),
            ETH_LOGS: subprocess.CompletedProcess(ETH_LOGS, 0, "",
                "[Downloader] Syncing snapshots eta=1h34m data=83.02%,1.7TB/2.0TB\n"),
            ETH_DISK: subprocess.CompletedProcess(ETH_DISK, 0,
                "1B-blocks Used Avail Use%\n3000000000000 1800000000000 1100000000000 63%\n", ""),
            BTC_ARTIFACT: subprocess.CompletedProcess(BTC_ARTIFACT, 0,
                '{"BTC":{"state":"not_built"}}', ""),
            ETH_ARTIFACTS: subprocess.CompletedProcess(ETH_ARTIFACTS, 0,
                '{"USDT":{"state":"not_built"},"USDC":{"state":"not_built"}}', ""),
        }
        result = collect(run=lambda command: replies[command],
                         now=datetime(2026, 9, 24, 10, 0, tzinfo=timezone.utc))
        self.assertEqual(result["observed_at"], "2026-09-24T10:00:00Z")
        self.assertEqual(result["bitcoin"]["state"], "syncing")
        self.assertFalse(result["bitcoin"]["snapshot_sync_gate_open"])
        self.assertEqual(result["ethereum"]["current_block"], 0)
        self.assertEqual(result["ethereum"]["snapshot_download_percent"], 83.02)
        self.assertEqual(result["ethereum"]["disk_available_bytes"], 1100000000000)
        self.assertFalse(result["ethereum"]["token_scan_sync_gate_open"])
        self.assertFalse(result["ranking_publication_ready"])
        self.assertEqual(result["private_artifacts"]["BTC"]["state"], "not_built")
        self.assertEqual(result["private_artifacts"]["USDT"]["state"], "not_built")

    def test_errors_do_not_turn_into_false_readiness(self):
        def failing(command):
            if command == BTC_INFO:
                raise subprocess.TimeoutExpired(command, 20)
            if command == ETH_SYNC:
                return subprocess.CompletedProcess(command, 0, '{"result":false}', "")
            if command == ETH_LOGS:
                return subprocess.CompletedProcess(command, 0, "", "")
            return subprocess.CompletedProcess(command, 0, "malformed disk output", "")
        result = collect(run=failing)
        self.assertEqual(result["bitcoin"]["state"], "unavailable")
        self.assertEqual(result["ethereum"]["state"], "unavailable")
        self.assertEqual(result["private_artifacts"]["BTC"]["state"], "unavailable")
        self.assertFalse(result["ranking_publication_ready"])

    def test_present_private_files_still_require_review(self):
        def run(command):
            if command == BTC_ARTIFACT:
                return subprocess.CompletedProcess(command, 0, json.dumps({
                    "BTC": {"state": "private_file_present", "size_bytes": 8142,
                            "review_required": True}}), "")
            if command == ETH_ARTIFACTS:
                return subprocess.CompletedProcess(command, 0, json.dumps({
                    "USDT": {"state": "private_file_present", "size_bytes": 9301,
                             "review_required": True},
                    "USDC": {"state": "invalid_file"}}), "")
            raise subprocess.TimeoutExpired(command, 20)
        result = collect(run=run)
        self.assertEqual(result["private_artifacts"]["BTC"]["size_bytes"], 8142)
        self.assertTrue(result["private_artifacts"]["USDT"]["review_required"])
        self.assertEqual(result["private_artifacts"]["USDC"]["state"], "invalid_file")
        self.assertFalse(result["ranking_publication_ready"])

    def test_old_downloader_log_does_not_override_synced_rpc(self):
        result = _ethereum('{"result":false}',
                           '[Downloader] Syncing snapshots eta=1h data=83.02%,1.7TB/2.0TB',
                           'Size Used Avail Use%\n1000 600 400 60%\n')
        self.assertEqual(result["state"], "rpc_synced")
        self.assertTrue(result["token_scan_sync_gate_open"])
        self.assertNotIn("snapshot_download_percent", result)
        self.assertEqual(result["disk_used_percent"], 60.0)


if __name__ == "__main__":
    unittest.main()
