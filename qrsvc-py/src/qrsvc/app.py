"""Pure request logic for POST /api/v1/qr (no I/O). Spec: api/openapi.yaml."""
from __future__ import annotations

import uuid

from .qr_capacity import EC_LEVELS, MAX_DATA_BYTES, select_version

# Allowed response shape — enforced by spec (additionalProperties: false).
_RESPONSE_KEYS = ("qr_id", "error_correction", "qr_size", "image_url", "border")

BORDER_MIN = 0
BORDER_MAX = 40
BORDER_DEFAULT = 4


class QrError(Exception):
    """Validation / capacity error surfaced as HTTP 422."""

    def __init__(self, message: str, status: int = 422):
        super().__init__(message)
        self.message = message
        self.status = status


def validate_payload(payload) -> tuple[dict | None, QrError | None]:
    """Validate the request body against the OpenAPI request schema.

    Returns (clean_payload, None) on success or (None, QrError) on failure.
    """
    if not isinstance(payload, dict):
        return None, QrError("request body must be a JSON object")

    # additionalProperties: false
    allowed = {"data", "error_correction", "border"}
    extras = payload.keys() - allowed
    if extras:
        return None, QrError(f"unknown properties: {sorted(extras)}")

    # data: required, string, minLength 1, maxLength 2953
    if "data" not in payload:
        return None, QrError("'data' is required")
    data = payload["data"]
    if not isinstance(data, str):
        return None, QrError("'data' must be a string")

    byte_len = len(data.encode("utf-8"))
    if byte_len < 1:
        return None, QrError("'data' must be non-empty (minLength: 1)")
    if byte_len > MAX_DATA_BYTES:
        return None, QrError(
            f"'data' exceeds maximum length {MAX_DATA_BYTES} bytes"
        )

    # error_correction: enum L|M|Q|H, default M
    ec = payload.get("error_correction", "M")
    if ec not in EC_LEVELS:
        return None, QrError(
            f"'error_correction' must be one of {list(EC_LEVELS)}"
        )

    # border: optional integer quiet zone, minimum 0, maximum 40, default 4
    border = payload.get("border", BORDER_DEFAULT)
    if isinstance(border, bool) or not isinstance(border, int):
        return None, QrError("'border' must be an integer")
    if border < BORDER_MIN or border > BORDER_MAX:
        return None, QrError(
            f"'border' must be between {BORDER_MIN} and {BORDER_MAX}"
        )

    return (
        {"data": data, "error_correction": ec, "border": border, "_byte_len": byte_len},
        None,
    )


def select_qr_version(data: str, ec_level: str):
    """Return smallest version fitting data, or a QrError(422) if none fits."""
    byte_len = len(data.encode("utf-8"))
    version = select_version(byte_len, ec_level)
    if version is None:
        return QrError(
            "Payload does not fit selected version/EC level", status=422
        )
    return version


def build_response(qr_id: str, ec_level: str, version: int, border: int) -> dict:
    image_url = f"placeholder://{qr_id}.png"
    return {
        "qr_id": qr_id,
        "error_correction": ec_level,
        "qr_size": version,
        "image_url": image_url,
        "border": border,
    }


def handle_create_qr(payload) -> tuple[int, dict]:
    """End-to-end business logic: validate -> select version -> build response.

    Returns (http_status, body_dict). Side effect: generates a fresh qr_id.
    """
    clean, err = validate_payload(payload)
    if err is not None:
        return err.status, {"error": err.message}

    version_or_err = select_qr_version(clean["data"], clean["error_correction"])
    if isinstance(version_or_err, QrError):
        return version_or_err.status, {"error": version_or_err.message}

    qr_id = str(uuid.uuid4())
    body = build_response(qr_id, clean["error_correction"], version_or_err, clean["border"])
    # enforce spec shape strictly (defensive; tests rely on this)
    assert set(body.keys()) == set(_RESPONSE_KEYS)
    return 201, body
