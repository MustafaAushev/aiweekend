"""HTTP layer for QR service: stdlib http.server. Spec: api/openapi.yaml."""
from __future__ import annotations

import json
import logging

from http.server import BaseHTTPRequestHandler

from .app import handle_create_qr

logger = logging.getLogger("qrsvc")

_PATH = "/api/v1/qr"


def _send_json(handler, status: int, body: dict):
    payload = json.dumps(body).encode("utf-8")
    handler.send_response(status)
    handler.send_header("Content-Type", "application/json")
    handler.send_header("Content-Length", str(len(payload)))
    handler.end_headers()
    handler.wfile.write(payload)


def make_handler():
    class QrHandler(BaseHTTPRequestHandler):
        # silence default noisy logging; keep structured lines on stderr
        def log_message(self, fmt, *args):  # noqa: A002
            logger.info("http %s %s", self.address_string(), fmt % args)

        def do_POST(self):  # noqa: N802
            if self.path != _PATH:
                _send_json(self, 404, {"error": "not found"})
                return
            ctype = self.headers.get("Content-Type", "")
            if not ctype.startswith("application/json"):
                _send_json(self, 422, {"error": "Content-Type must be application/json"})
                return
            length = int(self.headers.get("Content-Length", 0) or 0)
            raw = self.rfile.read(length) if length else b""
            try:
                payload = json.loads(raw.decode("utf-8")) if raw else None
            except (ValueError, UnicodeDecodeError):
                _send_json(self, 422, {"error": "request body must be valid JSON"})
                return
            status, body = handle_create_qr(payload)
            _send_json(self, status, body)

        def do_GET(self):  # noqa: N802
            if self.path != _PATH:
                _send_json(self, 404, {"error": "not found"})
                return
            _send_json(self, 405, {"error": "method not allowed"})

        def do_PUT(self):  # noqa: N802
            if self.path != _PATH:
                _send_json(self, 404, {"error": "not found"})
                return
            _send_json(self, 405, {"error": "method not allowed"})

        def do_DELETE(self):  # noqa: N802
            if self.path != _PATH:
                _send_json(self, 404, {"error": "not found"})
                return
            _send_json(self, 405, {"error": "method not allowed"})

    return QrHandler


def serve(host: str = "127.0.0.1", port: int = 8000):
    from http.server import ThreadingHTTPServer

    logging.basicConfig(
        level=logging.INFO,
        format='{"ts":"%(asctime)s","lvl":"%(levelname)s","msg":"%(message)s"}',
    )
    httpd = ThreadingHTTPServer((host, port), make_handler())
    logger.info("listening on %s:%d", host, port)
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        httpd.server_close()


if __name__ == "__main__":
    import sys

    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8000
    serve(port=port)
