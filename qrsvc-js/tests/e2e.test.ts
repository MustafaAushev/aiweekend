// E2E smoke: one full happy-path through a real listening socket, end-to-end.
import { createHandler } from "../src/qrsvc/server.js";
import { postJson, runningServer } from "./http.js";

const UUID_V4_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

test("e2e smoke happy path", async () => {
  const srv = await runningServer(createHandler);
  try {
    const { status, body: raw } = await postJson(srv.base, "/api/v1/qr", { data: "https://example.com" });
    expect(status).toBe(201);
    const obj = JSON.parse(raw);
    expect(new Set(Object.keys(obj))).toEqual(
      new Set(["qr_id", "error_correction", "qr_size", "image_url", "border"]),
    );
    // qr_id looks like a uuid v4
    expect(obj.qr_id).toMatch(UUID_V4_RE);
    expect(obj.error_correction).toBe("M");
    // "https://example.com" is 19 bytes -> V1-M cap is 14, so V2-M.
    expect(obj.qr_size).toBe(2);
    expect(obj.image_url.startsWith("placeholder://")).toBe(true);
    expect(obj.image_url).toContain(obj.qr_id);
    expect(obj.border).toBe(4); // spec default
  } finally {
    await srv.close();
  }
});

test("e2e smoke overflow 422", async () => {
  const srv = await runningServer(createHandler);
  try {
    const { status } = await postJson(srv.base, "/api/v1/qr", { data: "a".repeat(2000), error_correction: "H" });
    expect(status).toBe(422);
  } finally {
    await srv.close();
  }
});
