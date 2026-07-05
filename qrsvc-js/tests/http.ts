// Test helpers: spec loading + tiny in-memory HTTP client.
import { readFileSync } from "node:fs";
import { createServer, request as httpRequest, type Server } from "node:http";
import { AddressInfo } from "node:net";

import yaml from "js-yaml";

import type { createHandler } from "../src/qrsvc/server.js";

const SPEC_PATH = "api/openapi.yaml";

export function loadSpec(): any {
  return yaml.load(readFileSync(SPEC_PATH, "utf-8"));
}

export interface RunningServer {
  base: string;
  close(): Promise<void>;
}

/** Start an http.Server wired to handlerFactory() on an ephemeral port. */
export async function runningServer(
  handlerFactory: typeof createHandler,
): Promise<RunningServer> {
  const server: Server = createServer(handlerFactory());
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address() as AddressInfo;
  const base = `http://127.0.0.1:${port}`;
  return {
    base,
    close: () => new Promise<void>((resolve) => server.close(() => resolve())),
  };
}

export interface HttpResult {
  status: number;
  body: string;
}

export function postJson(base: string, path: string, body: unknown): Promise<HttpResult> {
  const data = body !== undefined ? Buffer.from(JSON.stringify(body), "utf-8") : Buffer.alloc(0);
  return rawRequest(base, path, "POST", data, "application/json");
}

export function rawRequest(
  base: string,
  path: string,
  method: string,
  data: Buffer,
  contentType: string,
): Promise<HttpResult> {
  const url = new URL(base + path);
  return new Promise((resolve, reject) => {
    const req = httpRequest(
      {
        hostname: url.hostname,
        port: url.port,
        path: url.pathname,
        method,
        headers: {
          "Content-Type": contentType,
          "Content-Length": String(data.length),
        },
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on("data", (c: Buffer) => chunks.push(c));
        res.on("end", () => {
          resolve({ status: res.statusCode ?? 0, body: Buffer.concat(chunks).toString("utf-8") });
        });
      },
    );
    req.on("error", reject);
    req.end(data);
  });
}
