# Test helpers: spec loading + tiny in-memory HTTP client.
import json
import socket
import threading
import time
import urllib.request
from contextlib import contextmanager
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

import yaml

SPEC_PATH = "api/openapi.yaml"


def load_spec():
    with open(SPEC_PATH, "r", encoding="utf-8") as fh:
        return yaml.safe_load(fh)


def _free_port() -> int:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        s.bind(("127.0.0.1", 0))
        return s.getsockname()[1]


@contextmanager
def running_server(handler_factory):
    """Start a ThreadingHTTPServer wired to handler_factory in a bg thread."""
    port = _free_port()
    httpd = ThreadingHTTPServer(("127.0.0.1", port), handler_factory())
    thr = threading.Thread(target=httpd.serve_forever, daemon=True)
    thr.start()
    base = f"http://127.0.0.1:{port}"
    # give the listener a moment to accept
    deadline = time.time() + 2.0
    while time.time() < deadline:
        try:
            with socket.create_connection(("127.0.0.1", port), timeout=0.2):
                break
        except OSError:
            time.sleep(0.02)
    try:
        yield base
    finally:
        httpd.shutdown()
        httpd.server_close()
        thr.join(timeout=2.0)


def post_json(base: str, path: str, body):
    data = json.dumps(body).encode("utf-8") if body is not None else b""
    req = urllib.request.Request(
        base + path,
        data=data,
        method="POST",
        headers={"Content-Type": "application/json"},
    )
    try:
        with urllib.request.urlopen(req, timeout=5.0) as resp:
            raw = resp.read().decode("utf-8")
            return resp.status, raw
    except urllib.error.HTTPError as exc:
        raw = exc.read().decode("utf-8")
        return exc.code, raw
