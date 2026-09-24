"""The background job must never export UTXOs before full validation."""

import json
import tempfile
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch

from service.bitcoin_snapshot_job import build_once


class BitcoinSnapshotJobTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.workdir = Path(self.temp.name) / "rankings"
        self.args = {"workdir": self.workdir, "cli": Path("/bin/false"),
                     "conf": Path("/etc/bitcoin.conf"), "datadir": Path("/var/lib/bitcoin"),
                     "converter": Path("/nonexistent/converter.py")}

    @patch("service.bitcoin_snapshot_job._cli")
    def test_initial_download_returns_without_export(self, cli):
        cli.return_value = json.dumps({"chain": "main", "blocks": 100,
                                       "headers": 900, "initialblockdownload": True})
        result = build_once(**self.args)
        self.assertEqual(result["status"], "waiting_for_full_validation")
        self.assertEqual(cli.call_count, 1)
        self.assertFalse((self.workdir / "bitcoin-top64-scripts.json").exists())

    @patch("service.bitcoin_snapshot_job._cli")
    def test_ready_check_is_read_only(self, cli):
        cli.return_value = json.dumps({"chain": "main", "blocks": 900,
                                       "headers": 900, "initialblockdownload": False})
        result = build_once(**self.args, check_only=True)
        self.assertEqual(result, {"status": "ready_to_build", "blocks": 900})
        self.assertEqual(cli.call_count, 1)

    @patch("service.bitcoin_snapshot_job._cli")
    def test_existing_result_prevents_second_snapshot(self, cli):
        self.workdir.mkdir()
        (self.workdir / "bitcoin-top64-scripts.json").write_text("{}")
        result = build_once(**self.args)
        self.assertEqual(result["status"], "already_built")
        cli.assert_not_called()

    def test_reorg_during_conversion_prevents_private_ranking_file(self):
        base_hash = "ab" * 32
        chain = json.dumps({"chain": "main", "blocks": 110, "headers": 110,
                            "initialblockdownload": False})
        hashes = iter((base_hash, "cd" * 32))

        def cli(*arguments):
            command = arguments[-2:]
            if command == ("getblockhash", "100"):
                return next(hashes)
            if arguments[-1] == "getblockchaininfo":
                return chain
            if "dumptxoutset" in arguments:
                return json.dumps({"base_height": 100, "base_hash": base_hash,
                                   "coins_written": 1})
            raise AssertionError(arguments)

        with patch("service.bitcoin_snapshot_job._cli", side_effect=cli), \
             patch("service.bitcoin_snapshot_job.shutil.disk_usage",
                   return_value=SimpleNamespace(free=1_000_000_000_000)), \
             patch("service.bitcoin_snapshot_job._sha256",
                   return_value="532bb3ce8c84d1448b930b7f9195e97ce604da713c5d5e58c00ceff27490e9b9"), \
             patch("service.bitcoin_snapshot_job.subprocess.run"), \
             patch("service.bitcoin_snapshot_job.rank_snapshot",
                   return_value={"base_hash": base_hash, "base_height": 100}):
            with self.assertRaisesRegex(ValueError, "changed during ranking"):
                build_once(**self.args)
        self.assertFalse((self.workdir / "bitcoin-top64-scripts.json").exists())


if __name__ == "__main__":
    unittest.main()
