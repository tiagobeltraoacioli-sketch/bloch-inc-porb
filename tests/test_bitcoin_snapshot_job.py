"""The background job must never export UTXOs before full validation."""

import json
import tempfile
import unittest
from pathlib import Path
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


if __name__ == "__main__":
    unittest.main()
