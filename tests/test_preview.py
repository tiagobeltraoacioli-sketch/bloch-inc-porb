import json
import os
import threading
import unittest
from http.server import ThreadingHTTPServer
from urllib.error import HTTPError
from urllib.request import Request, urlopen

from service.app import Handler
from service.data import OVERVIEW


class PreviewApiTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.old_token = os.environ.get("PORB_DEMO_TOKEN")
        os.environ["PORB_DEMO_TOKEN"] = "test-only-token"
        cls.server = ThreadingHTTPServer(("127.0.0.1", 0), Handler)
        cls.base = f"http://127.0.0.1:{cls.server.server_port}"
        cls.thread = threading.Thread(target=cls.server.serve_forever, daemon=True)
        cls.thread.start()

    @classmethod
    def tearDownClass(cls):
        cls.server.shutdown()
        cls.server.server_close()
        if cls.old_token is None:
            os.environ.pop("PORB_DEMO_TOKEN", None)
        else:
            os.environ["PORB_DEMO_TOKEN"] = cls.old_token

    def test_requires_token_and_blocks_writes(self):
        with self.assertRaises(HTTPError) as error:
            urlopen(self.base + "/api/v1/overview")
        self.assertEqual(error.exception.code, 401)
        request = Request(self.base + "/api/v1/overview", method="POST")
        with self.assertRaises(HTTPError) as error:
            urlopen(request)
        self.assertEqual(error.exception.code, 405)

    def test_authenticated_response_is_synthetic_and_not_cached(self):
        request = Request(self.base + "/api/v1/overview", headers={"Authorization": "Bearer test-only-token"})
        with urlopen(request) as response:
            data = json.load(response)
            self.assertEqual(response.headers["Cache-Control"], "no-store")
        self.assertEqual(data["mode"], "synthetic_demo")
        self.assertEqual(data["sample_size"]["transactions"], OVERVIEW["metrics"]["transactions_observed"])
        self.assertEqual(sum(item["count"] for item in data["risk_distribution"]), data["metrics"]["transactions_observed"])


if __name__ == "__main__":
    unittest.main()
