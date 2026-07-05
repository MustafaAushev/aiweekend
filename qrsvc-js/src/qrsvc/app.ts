// Pure request logic for POST /api/v1/qr (no I/O). Spec: api/openapi.yaml.
import { randomUUID } from "node:crypto";

import { EC_LEVELS, MAX_DATA_BYTES, selectVersion, type EcLevel } from "./qrCapacity.js";

// Allowed response shape — enforced by spec (additionalProperties: false).
const RESPONSE_KEYS = ["qr_id", "error_correction", "qr_size", "image_url", "border"] as const;

export const BORDER_MIN = 0;
export const BORDER_MAX = 40;
export const BORDER_DEFAULT = 4;

export class QrError extends Error {
  status: number;

  constructor(message: string, status = 422) {
    super(message);
    this.status = status;
  }
}

export interface CleanPayload {
  data: string;
  error_correction: EcLevel;
  border: number;
  byteLen: number;
}

export interface QrResponse {
  qr_id: string;
  error_correction: EcLevel;
  qr_size: number;
  image_url: string;
  border: number;
}

/**
 * Validate the request body against the OpenAPI request schema.
 * Returns [cleanPayload, null] on success or [null, QrError] on failure.
 */
export function validatePayload(payload: unknown): [CleanPayload | null, QrError | null] {
  if (typeof payload !== "object" || payload === null || Array.isArray(payload)) {
    return [null, new QrError("request body must be a JSON object")];
  }
  const obj = payload as Record<string, unknown>;

  // additionalProperties: false
  const allowed = new Set(["data", "error_correction", "border"]);
  const extras = Object.keys(obj).filter((k) => !allowed.has(k)).sort();
  if (extras.length > 0) {
    return [null, new QrError(`unknown properties: [${extras.map((e) => `'${e}'`).join(", ")}]`)];
  }

  // data: required, string, minLength 1, maxLength 2953
  if (!("data" in obj)) {
    return [null, new QrError("'data' is required")];
  }
  const data = obj.data;
  if (typeof data !== "string") {
    return [null, new QrError("'data' must be a string")];
  }

  const byteLen = Buffer.byteLength(data, "utf-8");
  if (byteLen < 1) {
    return [null, new QrError("'data' must be non-empty (minLength: 1)")];
  }
  if (byteLen > MAX_DATA_BYTES) {
    return [null, new QrError(`'data' exceeds maximum length ${MAX_DATA_BYTES} bytes`)];
  }

  // error_correction: enum L|M|Q|H, default M
  const ec = (obj.error_correction as EcLevel | undefined) ?? "M";
  if (!EC_LEVELS.includes(ec)) {
    return [null, new QrError(`'error_correction' must be one of ${JSON.stringify(EC_LEVELS)}`)];
  }

  // border: optional integer quiet zone, minimum 0, maximum 40, default 4
  const border = "border" in obj ? obj.border : BORDER_DEFAULT;
  if (typeof border !== "number" || !Number.isInteger(border)) {
    return [null, new QrError("'border' must be an integer")];
  }
  if (border < BORDER_MIN || border > BORDER_MAX) {
    return [null, new QrError(`'border' must be between ${BORDER_MIN} and ${BORDER_MAX}`)];
  }

  return [{ data, error_correction: ec, border, byteLen }, null];
}

/** Return smallest version fitting data, or a QrError(422) if none fits. */
export function selectQrVersion(data: string, ecLevel: EcLevel): number | QrError {
  const byteLen = Buffer.byteLength(data, "utf-8");
  const version = selectVersion(byteLen, ecLevel);
  if (version === null) {
    return new QrError("Payload does not fit selected version/EC level", 422);
  }
  return version;
}

export function buildResponse(qrId: string, ecLevel: EcLevel, version: number, border: number): QrResponse {
  const imageUrl = `placeholder://${qrId}.png`;
  return {
    qr_id: qrId,
    error_correction: ecLevel,
    qr_size: version,
    image_url: imageUrl,
    border,
  };
}

/**
 * End-to-end business logic: validate -> select version -> build response.
 * Returns [httpStatus, body]. Side effect: generates a fresh qr_id.
 */
export function handleCreateQr(payload: unknown): [number, QrResponse | { error: string }] {
  const [clean, err] = validatePayload(payload);
  if (err !== null) {
    return [err.status, { error: err.message }];
  }

  const versionOrErr = selectQrVersion(clean!.data, clean!.error_correction);
  if (versionOrErr instanceof QrError) {
    return [versionOrErr.status, { error: versionOrErr.message }];
  }

  const qrId = randomUUID();
  const body = buildResponse(qrId, clean!.error_correction, versionOrErr, clean!.border);
  // enforce spec shape strictly (defensive; tests rely on this)
  const keys = new Set(Object.keys(body));
  if (keys.size !== RESPONSE_KEYS.length || !RESPONSE_KEYS.every((k) => keys.has(k))) {
    throw new Error("response shape invariant violated");
  }
  return [201, body];
}
