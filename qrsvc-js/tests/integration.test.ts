// Integration tests: HTTP handler contract — status codes + body shapes per spec.
import { createHandler } from "../src/qrsvc/server.js";
import { loadSpec, rawRequest, runningServer, type RunningServer } from "./http.js";

const SPEC = loadSpec();
const RESP_201_REQUIRED = new Set<string>(
  SPEC.paths["/api/v1/qr"].post.responses["201"].content["application/json"].schema.required,
);

let srv: RunningServer;

beforeEach(async () => {
  srv = await runningServer(createHandler);
});

afterEach(async () => {
  await srv.close();
});

async function post(body: unknown, contentType = "application/json") {
  const data = body === undefined ? Buffer.alloc(0) : Buffer.from(JSON.stringify(body), "utf-8");
  const { status, body: raw } = await rawRequest(srv.base, "/api/v1/qr", "POST", data, contentType);
  return { status, body: raw };
}

test("happy path 201", async () => {
  const { status, body } = await post({ data: "hello" });
  expect(status).toBe(201);
  const obj = JSON.parse(body);
  expect(new Set(Object.keys(obj))).toEqual(RESP_201_REQUIRED); // no extra fields
  expect(typeof obj.qr_id).toBe("string");
  expect(obj.qr_id.length).toBeGreaterThan(0);
  expect(obj.error_correction).toBe("M"); // default
  expect(obj.qr_size).toBe(1); // 5 bytes -> V1-M
  expect(typeof obj.image_url).toBe("string");
  expect(obj.image_url).toBeTruthy();
  // placeholder: not a real rendered image
  expect(obj.image_url.startsWith("placeholder://")).toBe(true);
});

test("explicit ec level echoed", async () => {
  const { status, body } = await post({ data: "hello", error_correction: "H" });
  expect(status).toBe(201);
  expect(JSON.parse(body).error_correction).toBe("H");
});

test("border defaults to 4", async () => {
  const { status, body } = await post({ data: "hello" });
  expect(status).toBe(201);
  expect(JSON.parse(body).border).toBe(4); // spec default
});

test.each([0, 10, 40])("border explicit echoed: %i", async (border) => {
  const { status, body } = await post({ data: "hello", border });
  expect(status).toBe(201);
  expect(JSON.parse(body).border).toBe(border);
});

test.each([-1, 41])("border out of range 422: %i", async (border) => {
  const { status } = await post({ data: "hello", border });
  expect(status).toBe(422);
});

test("border non-integer 422", async () => {
  const { status } = await post({ data: "hello", border: "4" });
  expect(status).toBe(422);
});

test("capacity overflow returns 422", async () => {
  // V40-H cap is 1228; send 2000 bytes (within spec maxLength 2953).
  const { status } = await post({ data: "a".repeat(2000), error_correction: "H" });
  expect(status).toBe(422);
});

test("maxdata at V40-L 201", async () => {
  const { status } = await post({ data: "a".repeat(2953), error_correction: "L" });
  expect(status).toBe(201);
});

test("maxdata plus one 422", async () => {
  // exceeds spec maxLength AND v40-L capacity.
  const { status } = await post({ data: "a".repeat(2954), error_correction: "L" });
  expect(status).toBe(422);
});

test("missing data 422", async () => {
  const { status } = await post({});
  expect(status).toBe(422);
});

test("empty data 422", async () => {
  const { status } = await post({ data: "" });
  expect(status).toBe(422);
});

test("unknown property 422", async () => {
  const { status } = await post({ data: "x", extra: 1 });
  expect(status).toBe(422);
});

test("bad ec enum 422", async () => {
  const { status } = await post({ data: "x", error_correction: "Z" });
  expect(status).toBe(422);
});

test("non-JSON body 422", async () => {
  const { status } = await rawRequest(srv.base, "/api/v1/qr", "POST", Buffer.from("not-json"), "application/json");
  expect(status).toBe(422);
});

test("wrong content-type 422", async () => {
  const { status } = await post({ data: "x" }, "text/plain");
  expect(status).toBe(422);
});

test("wrong method 404 or 405", async () => {
  const { status } = await rawRequest(srv.base, "/api/v1/qr", "GET", Buffer.alloc(0), "application/json");
  expect([404, 405]).toContain(status);
});

test("unknown path 404", async () => {
  const { status } = await rawRequest(srv.base, "/nope", "GET", Buffer.alloc(0), "application/json");
  expect(status).toBe(404);
});
