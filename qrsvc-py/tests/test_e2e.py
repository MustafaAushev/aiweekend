# E2E smoke: one full happy-path through a real listening socket, end-to-end.
import json
import re

from qrsvc.server import make_handler
from tests._http import post_json, running_server


def test_e2e_smoke_happy_path():
    with running_server(make_handler) as base:
        status, raw = post_json(base, "/api/v1/qr", {"data": "https://example.com"})
        assert status == 201
        obj = json.loads(raw)
        assert set(obj.keys()) == {
            "qr_id", "error_correction", "qr_size", "image_url", "border",
        }
        # qr_id looks like a uuid v4
        assert re.match(
            r"^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$",
            obj["qr_id"],
        )
        assert obj["error_correction"] == "M"
        # "https://example.com" is 19 bytes -> V1-M cap is 14, so V2-M.
        assert obj["qr_size"] == 2
        assert obj["image_url"].startswith("placeholder://")
        assert obj["qr_id"] in obj["image_url"]
        assert obj["border"] == 4  # spec default


def test_e2e_smoke_overflow_422():
    with running_server(make_handler) as base:
        status, _ = post_json(
            base, "/api/v1/qr", {"data": "a" * 2000, "error_correction": "H"}
        )
        assert status == 422
