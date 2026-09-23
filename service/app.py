"""Local preview API with synthetic overview and exact official-list screening."""

import hmac
import json
import os
import re
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

from .data import OVERVIEW
from .ofac import SourceUnavailable, screen_identifier

HOST = "127.0.0.1"
PORT = 8765


class Handler(BaseHTTPRequestHandler):
    def _authorized(self):
        token = os.environ.get("PORB_DEMO_TOKEN", "")
        supplied = self.headers.get("Authorization", "")
        return bool(token) and hmac.compare_digest(supplied, "Bearer " + token)

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
        if not self._authorized():
            return self._send(401, {"error": "unauthorized"})
        if self.path == "/api/v1/overview":
            return self._send(200, OVERVIEW)
        return self._send(404, {"error": "not_found"})

    def do_POST(self):
        if self.path != "/api/v1/sanctions:screen":
            return self._send(405, {"error": "read_only_preview"})
        if not self._authorized():
            return self._send(401, {"error": "unauthorized"})
        try:
            length = int(self.headers.get("Content-Length", "0"))
            if length <= 0 or length > 1024:
                return self._send(413, {"error": "invalid_request_size"})
            body = json.loads(self.rfile.read(length))
            if set(body) != {"asset_symbol", "address", "network"} or not isinstance(body["network"], str) or not re.fullmatch(r"[A-Za-z0-9._:-]{2,40}", body["network"]):
                return self._send(400, {"error": "invalid_request"})
            result = screen_identifier(body["asset_symbol"], body["address"])
            result["network_supplied"] = body["network"]
            result["network_verified"] = False
            return self._send(200, result)
        except (SourceUnavailable, FileNotFoundError, OSError):
            return self._send(503, {"error": "source_unavailable"})
        except (ValueError, TypeError, json.JSONDecodeError):
            return self._send(400, {"error": "invalid_request"})

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
