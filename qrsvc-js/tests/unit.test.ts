// Unit tests: pure algorithm + payload validation, against openapi.yaml spec.
import fc from "fast-check";

import {
  EC_LEVELS,
  MAX_DATA_BYTES,
  MAX_VERSION,
  capacity,
  selectVersion,
  type EcLevel,
} from "../src/qrsvc/qrCapacity.js";
import { validatePayload, selectQrVersion, handleCreateQr, QrError } from "../src/qrsvc/app.js";
import { loadSpec } from "./http.js";

const SPEC = loadSpec();
const REQ_SCHEMA = SPEC.paths["/api/v1/qr"].post.requestBody.content["application/json"].schema;
const RESP_SCHEMA = SPEC.paths["/api/v1/qr"].post.responses["201"].content["application/json"].schema;

// --- T1 unit: edge-cases of the capacity-selection algorithm ---

describe("selectVersion boundaries", () => {
  test.each([
    [1, "L", 1], // smallest payload -> version 1
    [17, "L", 1], // exactly V1-L capacity -> V1 (boundary: <=)
    [18, "L", 2], // one byte over V1-L -> V2
    [7, "H", 1], // V1-H boundary
    [8, "H", 2], // over V1-H
    [2953, "L", 40], // absolute max (matches spec maxLength)
    [1228, "H", 40], // V40-H boundary
  ])("selectVersion(%i, %s) === %i", (byteLen, ec, expected) => {
    expect(selectVersion(byteLen as number, ec as EcLevel)).toBe(expected);
  });
});

test("selectVersion overflow returns null", () => {
  // V40-L capacity is 2953; one more byte must not fit any version.
  expect(selectVersion(2954, "L")).toBeNull();
  // V40-H capacity is 1228; H stricter than L.
  expect(selectVersion(2953, "H")).toBeNull();
  expect(selectVersion(1229, "H")).toBeNull();
});

describe.each(EC_LEVELS)("capacity table monotone for %s", (ec) => {
  test("monotone and matches max version", () => {
    const caps = Array.from({ length: MAX_VERSION }, (_, i) => capacity(i + 1, ec));
    expect(caps).toEqual([...caps].sort((a, b) => a - b));
    expect(caps[caps.length - 1]).toBe(capacity(MAX_VERSION, ec));
  });
});

test("capacity ordering L >= M >= Q >= H", () => {
  for (let v = 1; v <= MAX_VERSION; v++) {
    expect(capacity(v, "L")).toBeGreaterThanOrEqual(capacity(v, "M"));
    expect(capacity(v, "M")).toBeGreaterThanOrEqual(capacity(v, "Q"));
    expect(capacity(v, "Q")).toBeGreaterThanOrEqual(capacity(v, "H"));
  }
});

// --- spec-derived invariants ---

test("spec maxLength matches V40-L capacity", () => {
  expect(REQ_SCHEMA.properties.data.maxLength).toBe(MAX_DATA_BYTES);
  expect(MAX_DATA_BYTES).toBe(2953);
});

test("spec ec enum matches table", () => {
  expect(new Set(REQ_SCHEMA.properties.error_correction.enum)).toEqual(new Set(EC_LEVELS));
});

test("spec border bounds and default", () => {
  const border = REQ_SCHEMA.properties.border;
  expect(border.type).toBe("integer");
  expect(border.minimum).toBe(0);
  expect(border.maximum).toBe(40);
  expect(border.default).toBe(4);
});

test("response shape strict", () => {
  // additionalProperties false + exactly five required fields.
  const required = new Set(["qr_id", "error_correction", "qr_size", "image_url", "border"]);
  expect(RESP_SCHEMA.additionalProperties).toBe(false);
  expect(new Set(RESP_SCHEMA.required)).toEqual(required);
  expect(new Set(Object.keys(RESP_SCHEMA.properties))).toEqual(required);
});

// --- payload validation (pure) ---

test("validate ok default ec", () => {
  const [p, err] = validatePayload({ data: "hello" });
  expect(err).toBeNull();
  expect(p!.data).toBe("hello");
  expect(p!.error_correction).toBe("M"); // spec default
});

test("validate rejects missing data", () => {
  const [, err] = validatePayload({});
  expect(err).not.toBeNull();
  expect(err!.status).toBe(422);
});

test("validate rejects empty data", () => {
  const [, err] = validatePayload({ data: "" });
  expect(err!.status).toBe(422); // minLength: 1
});

test("validate rejects non-string data", () => {
  const [, err] = validatePayload({ data: 123 });
  expect(err!.status).toBe(422);
});

test("validate rejects unknown property", () => {
  // additionalProperties: false
  const [, err] = validatePayload({ data: "x", foo: "bar" });
  expect(err!.status).toBe(422);
});

test("validate rejects bad ec enum", () => {
  const [, err] = validatePayload({ data: "x", error_correction: "X" });
  expect(err!.status).toBe(422);
});

test("validate rejects oversize data", () => {
  const [, err] = validatePayload({ data: "a".repeat(MAX_DATA_BYTES + 1) });
  expect(err!.status).toBe(422);
});

// --- border (quiet zone) validation ---

test("validate border defaults to 4", () => {
  const [p, err] = validatePayload({ data: "hello" });
  expect(err).toBeNull();
  expect(p!.border).toBe(4); // spec default
});

test.each([0, 4, 10, 40])("validate border within bounds accepted: %i", (border) => {
  const [p, err] = validatePayload({ data: "hello", border });
  expect(err).toBeNull();
  expect(p!.border).toBe(border);
});

test.each([-1, 41, 100])("validate rejects border out of range: %i", (border) => {
  const [, err] = validatePayload({ data: "hello", border });
  expect(err!.status).toBe(422);
});

test("validate rejects non-integer border", () => {
  const [, err] = validatePayload({ data: "hello", border: "4" });
  expect(err!.status).toBe(422);
});

test("validate rejects bool border", () => {
  // JS booleans are not `number`, so must be rejected the same as Python's bool/int subclass case.
  const [, err] = validatePayload({ data: "hello", border: true });
  expect(err!.status).toBe(422);
});

// --- end-to-end version selection business rule ---

test("selectQrVersion uses byte length", () => {
  // Cyrillic "я" is 2 bytes in UTF-8 -> 1 char but 2-byte payload.
  const result = selectQrVersion("я", "L");
  expect(typeof result).toBe("number");
  // 2 bytes -> still fits V1-L (cap 17)
  expect(result).toBe(1);
});

test("selectQrVersion overflow emits 422", () => {
  const err = selectQrVersion("a".repeat(MAX_DATA_BYTES + 1), "L");
  expect(err).toBeInstanceOf(QrError);
  expect((err as QrError).status).toBe(422);
});

test("selectQrVersion H overflow within maxLength", () => {
  // 2000 chars fits in V40-L but overflows H (cap 1228) -> 422 per spec.
  const err = selectQrVersion("a".repeat(2000), "H");
  expect(err).toBeInstanceOf(QrError);
  expect((err as QrError).status).toBe(422);
});

// --- property-based: нерушимый инвариант error_correction ---
// "возвращённый error_correction равен запрошенному ИЛИ ответ 422"
// (никогда не тихая подмена уровня коррекции и никогда не падение с иным кодом).

test("property: error_correction echoed or 422", () => {
  fc.assert(
    fc.property(
      fc.string({ maxLength: 3500 }),
      fc.constantFrom(...EC_LEVELS),
      (data, ec) => {
        const [status, body] = handleCreateQr({ data, error_correction: ec });
        expect([201, 422]).toContain(status);
        if (status === 201) {
          expect((body as any).error_correction).toBe(ec);
        } else {
          expect("error" in body).toBe(true);
        }
      },
    ),
    { numRuns: 1000 },
  );
});
