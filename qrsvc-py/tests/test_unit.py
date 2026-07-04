# Unit tests: pure algorithm + payload validation, against openapi.yaml spec.
import pytest

from qrsvc.qr_capacity import (
    EC_LEVELS,
    MAX_DATA_BYTES,
    MAX_VERSION,
    capacity,
    select_version,
)
from qrsvc.app import validate_payload, select_qr_version, QrError

from tests._http import load_spec

SPEC = load_spec()
REQ_SCHEMA = SPEC["paths"]["/api/v1/qr"]["post"]["requestBody"]["content"][
    "application/json"
]["schema"]
RESP_SCHEMA = SPEC["paths"]["/api/v1/qr"]["post"]["responses"]["201"]["content"][
    "application/json"
]["schema"]


# --- T1 unit: edge-cases of the capacity-selection algorithm ---


@pytest.mark.parametrize(
    "byte_len,ec,expected_version",
    [
        (1, "L", 1),       # smallest payload -> version 1
        (17, "L", 1),      # exactly V1-L capacity -> V1 (boundary: <=)
        (18, "L", 2),      # one byte over V1-L -> V2
        (7, "H", 1),       # V1-H boundary
        (8, "H", 2),       # over V1-H
        (2953, "L", 40),   # absolute max (matches spec maxLength)
        (1228, "H", 40),   # V40-H boundary
    ],
)
def test_select_version_boundaries(byte_len, ec, expected_version):
    assert select_version(byte_len, ec) == expected_version


def test_select_version_overflow_returns_none():
    # V40-L capacity is 2953; one more byte must not fit any version.
    assert select_version(2954, "L") is None
    # V40-H capacity is 1228; H stricter than L.
    assert select_version(2953, "H") is None
    assert select_version(1229, "H") is None


@pytest.mark.parametrize("ec", EC_LEVELS)
def test_capacity_table_monotone_per_ec(ec):
    caps = [capacity(v, ec) for v in range(1, MAX_VERSION + 1)]
    assert caps == sorted(caps), f"capacities not monotone for {ec}"
    assert caps[-1] == capacity(MAX_VERSION, ec)


def test_capacity_ordering_l_gt_m_gt_q_gt_h():
    for v in range(1, MAX_VERSION + 1):
        assert capacity(v, "L") >= capacity(v, "M") >= capacity(v, "Q") >= capacity(v, "H")


# --- spec-derived invariants ---


def test_spec_maxlength_matches_v40_l_capacity():
    assert REQ_SCHEMA["properties"]["data"]["maxLength"] == MAX_DATA_BYTES == 2953


def test_spec_ec_enum_matches_table():
    assert set(REQ_SCHEMA["properties"]["error_correction"]["enum"]) == set(EC_LEVELS)


def test_response_shape_strict():
    # additionalProperties false + exactly four required fields.
    assert RESP_SCHEMA["additionalProperties"] is False
    assert set(RESP_SCHEMA["required"]) == {"qr_id", "error_correction", "qr_size", "image_url"}
    assert set(RESP_SCHEMA["properties"].keys()) == {"qr_id", "error_correction", "qr_size", "image_url"}


# --- payload validation (pure) ---


def test_validate_ok_default_ec():
    p, err = validate_payload({"data": "hello"})
    assert err is None
    assert p["data"] == "hello"
    assert p["error_correction"] == "M"  # spec default


def test_validate_rejects_missing_data():
    p, err = validate_payload({})
    assert err is not None and err.status == 422


def test_validate_rejects_empty_data():
    p, err = validate_payload({"data": ""})
    assert err is not None and err.status == 422  # minLength: 1


def test_validate_rejects_non_string_data():
    p, err = validate_payload({"data": 123})
    assert err is not None and err.status == 422


def test_validate_rejects_unknown_property():
    # additionalProperties: false
    p, err = validate_payload({"data": "x", "foo": "bar"})
    assert err is not None and err.status == 422


def test_validate_rejects_bad_ec_enum():
    p, err = validate_payload({"data": "x", "error_correction": "X"})
    assert err is not None and err.status == 422


def test_validate_rejects_oversize_data():
    p, err = validate_payload({"data": "a" * (MAX_DATA_BYTES + 1)})
    assert err is not None and err.status == 422


# --- end-to-end version selection business rule ---


def test_select_qr_version_uses_byte_length():
    # Cyrillic "я" is 2 bytes in UTF-8 -> 1 char but 2-byte payload.
    result = select_qr_version("я", "L")
    assert isinstance(result, int)
    # 2 bytes -> still fits V1-L (cap 17)
    assert result == 1


def test_select_qr_version_overflow_emits_422():
    err = select_qr_version("a" * (MAX_DATA_BYTES + 1), "L")
    assert isinstance(err, QrError) and err.status == 422


def test_select_qr_version_h_overflow_within_maxlength():
    # 2000 chars fits in V40-L but overflows H (cap 1228) -> 422 per spec.
    err = select_qr_version("a" * 2000, "H")
    assert isinstance(err, QrError) and err.status == 422
