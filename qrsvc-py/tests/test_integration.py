# Integration tests: HTTP handler contract — status codes + body shapes per spec.
import json

import pytest

from qrsvc.server import make_handler
from tests._http import load_spec, post_json, running_server

SPEC = load_spec()
RESP_201_REQUIRED = set(
    SPEC["paths"]["/api/v1/qr"]["post"]["responses"]["201"]["content"][
        "application/json"
    ]["schema"]["required"]
)


@pytest.fixture
def base():
    with running_server(make_handler) as b:
        yield b


def _post(base, body, raw_bytes: bytes | None = None, content_type="application/json"):
    import urllib.request
    if raw_bytes is not None:
        data = raw_bytes
    elif body is ... :
        data = b""
    else:
        data = json.dumps(body).encode("utf-8")
    req = urllib.request.Request(
        base + "/api/v1/qr",
        data=data,
        method="POST",
        headers={"Content-Type": content_type},
    )
    import urllib.error
    try:
        with urllib.request.urlopen(req, timeout=5.0) as resp:
            return resp.status, resp.read().decode("utf-8")
    except urllib.error.HTTPError as exc:
        return exc.code, exc.read().decode("utf-8")


def test_happy_path_201(base):
    status, body = _post(base, {"data": "hello"})
    assert status == 201
    obj = json.loads(body)
    assert set(obj.keys()) == RESP_201_REQUIRED  # no extra fields
    assert isinstance(obj["qr_id"], str) and len(obj["qr_id"]) > 0
    assert obj["error_correction"] == "M"  # default
    assert obj["qr_size"] == 1              # 5 bytes -> V1-M? check below
    assert isinstance(obj["image_url"], str) and obj["image_url"]
    # placeholder: not a real rendered image
    assert obj["image_url"].startswith("placeholder://")


def test_explicit_ec_level_echoed(base):
    status, body = _post(base, {"data": "hello", "error_correction": "H"})
    assert status == 201
    obj = json.loads(body)
    assert obj["error_correction"] == "H"


def test_border_defaults_to_4(base):
    status, body = _post(base, {"data": "hello"})
    assert status == 201
    obj = json.loads(body)
    assert obj["border"] == 4  # spec default


@pytest.mark.parametrize("border", [0, 10, 40])
def test_border_explicit_echoed(base, border):
    status, body = _post(base, {"data": "hello", "border": border})
    assert status == 201
    obj = json.loads(body)
    assert obj["border"] == border


@pytest.mark.parametrize("border", [-1, 41])
def test_border_out_of_range_422(base, border):
    status, _ = _post(base, {"data": "hello", "border": border})
    assert status == 422


def test_border_non_integer_422(base):
    status, _ = _post(base, {"data": "hello", "border": "4"})
    assert status == 422


def test_capacity_overflow_returns_422(base):
    # V40-H cap is 1228; send 2000 bytes (within spec maxLength 2953).
    status, _ = _post(base, {"data": "a" * 2000, "error_correction": "H"})
    assert status == 422


def test_maxdata_at_v40_l_201(base):
    status, _ = _post(base, {"data": "a" * 2953, "error_correction": "L"})
    assert status == 201


def test_maxdata_plus_one_422(base):
    # exceeds spec maxLength AND v40-L capacity.
    status, _ = _post(base, {"data": "a" * 2954, "error_correction": "L"})
    assert status == 422


def test_missing_data_422(base):
    status, _ = _post(base, {})
    assert status == 422


def test_empty_data_422(base):
    status, _ = _post(base, {"data": ""})
    assert status == 422


def test_unknown_property_422(base):
    status, _ = _post(base, {"data": "x", "extra": 1})
    assert status == 422


def test_bad_ec_enum_422(base):
    status, _ = _post(base, {"data": "x", "error_correction": "Z"})
    assert status == 422


def test_non_json_body_422(base):
    status, _ = _post(base, body=..., raw_bytes=b"not-json")
    assert status == 422


def test_wrong_content_type_422(base):
    status, _ = _post(base, {"data": "x"}, content_type="text/plain")
    assert status == 422


def test_wrong_method_404_or_405(base):
    import urllib.request
    req = urllib.request.Request(base + "/api/v1/qr", method="GET")
    import urllib.error
    try:
        with urllib.request.urlopen(req, timeout=5.0) as resp:
            assert resp.status in (404, 405)
    except urllib.error.HTTPError as exc:
        assert exc.code in (404, 405)


def test_unknown_path_404(base):
    import urllib.request
    req = urllib.request.Request(base + "/nope", method="GET")
    import urllib.error
    try:
        with urllib.request.urlopen(req, timeout=5.0) as resp:
            assert resp.status == 404
    except urllib.error.HTTPError as exc:
        assert exc.code == 404
