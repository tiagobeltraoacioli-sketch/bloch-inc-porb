"""Local, read-only example API. It deliberately has no live ingestion path."""

import hmac
import json
import os
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

from .data import OVERVIEW

HOST = "127.0.0.1"
PORT = 8765


class Handler(BaseHTTPRequestHandler):
    def _send(self, code, body):
        encoded = json.dumps(body, separators=(",", ":"), ensure_ascii=False).encode()
        self.send_response(code)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(encoded)))
        self.send_header("Cache-Control", "no-store")
        self.send_header("X-Content-Type-Options", "nosniff")
        self.send_header("Referrer-Policy", "no-referrer")
        self.end_headers()
        self.wfile.write(encoded)

    def do_GET(self):
        if self.path == "/health":
            return self._send(200, {"status": "ok", "mode": "synthetic_demo"})
        token = os.environ.get("PORB_DEMO_TOKEN", "")
        supplied = self.headers.get("Authorization", "")
        if not token or not hmac.compare_digest(supplied, "Bearer " + token):
            return self._send(401, {"error": "unauthorized"})
        if self.path == "/api/v1/overview":
            return self._send(200, OVERVIEW)
        return self._send(404, {"error": "not_found"})

    def do_POST(self):
        return self._send(405, {"error": "read_only_preview"})

    def log_message(self, format, *args):
        # Do not log request paths: future path parameters may be identifying.
        pass


def main():
    if not os.environ.get("PORB_DEMO_TOKEN"):
        raise SystemExit("Set PORB_DEMO_TOKEN before starting the example API")
    server = ThreadingHTTPServer((HOST, PORT), Handler)
    print(f"BI-PoRB synthetic API listening on http://{HOST}:{PORT}")
    server.serve_forever()


if __name__ == "__main__":
    main()
