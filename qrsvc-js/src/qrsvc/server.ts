// HTTP layer for QR service: node:http. Spec: api/openapi.yaml.
import { createServer, type IncomingMessage, type ServerResponse, type Server } from "node:http";

import { handleCreateQr } from "./app.js";

const PATH = "/api/v1/qr";

function log(msg: string): void {
  process.stderr.write(JSON.stringify({ ts: new Date().toISOString(), lvl: "INFO", msg }) + "\n");
}

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  const payload = Buffer.from(JSON.stringify(body), "utf-8");
  res.writeHead(status, {
    "Content-Type": "application/json",
    "Content-Length": String(payload.length),
  });
  res.end(payload);
}

function readBody(req: IncomingMessage): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (chunk: Buffer) => chunks.push(chunk));
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

export function createHandler() {
  return async (req: IncomingMessage, res: ServerResponse): Promise<void> => {
    const path = (req.url ?? "").split("?")[0];

    if (path !== PATH) {
      sendJson(res, 404, { error: "not found" });
      return;
    }

    if (req.method === "POST") {
      const ctype = req.headers["content-type"] ?? "";
      if (!ctype.startsWith("application/json")) {
        sendJson(res, 422, { error: "Content-Type must be application/json" });
        return;
      }
      const raw = await readBody(req);
      let payload: unknown = null;
      try {
        payload = raw.length ? JSON.parse(raw.toString("utf-8")) : null;
      } catch {
        sendJson(res, 422, { error: "request body must be valid JSON" });
        return;
      }
      const [status, body] = handleCreateQr(payload);
      sendJson(res, status, body);
      return;
    }

    // GET / PUT / DELETE / others on the known path
    sendJson(res, 405, { error: "method not allowed" });
  };
}

export function serve(host = "127.0.0.1", port = 8000): Server {
  const server = createServer(createHandler());
  server.listen(port, host, () => {
    log(`listening on ${host}:${port}`);
  });
  return server;
}

const isMain = process.argv[1] && import.meta.url === `file://${process.argv[1]}`;
if (isMain) {
  const port = process.argv[2] ? parseInt(process.argv[2], 10) : 8000;
  serve("0.0.0.0", port);
}
