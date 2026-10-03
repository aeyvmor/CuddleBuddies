import { randomUUID } from "node:crypto";
import { createServer } from "node:http";
import pg from "pg";
import { createApp } from "./app";
import { loadConfig } from "./config";
import { MAX_BODY_BYTES } from "./http";

// Local development server only. Binds to loopback; uses the configured auth mode
// (normally `local-dev`, which trusts x-astig-dev-* headers and is refused in Lambda/production).
const config = loadConfig();
const pool = new pg.Pool({ connectionString: config.databaseUrl, max: 5 });
const handle = createApp({ pool, authMode: config.authMode, evidenceSigner: null });

const server = createServer(async (req, res) => {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    size += (chunk as Buffer).length;
    chunks.push(chunk as Buffer);
    if (size > MAX_BODY_BYTES) break; // oversized; the app rejects it with VALIDATION_FAILED
  }
  const url = new URL(req.url ?? "/", "http://localhost");
  const headers = Object.fromEntries(
    Object.entries(req.headers).map(([k, v]) => [k.toLowerCase(), Array.isArray(v) ? v.join(",") : v]),
  );
  const response = await handle({
    method: req.method ?? "GET",
    path: url.pathname,
    headers,
    body: chunks.length ? Buffer.concat(chunks).toString("utf8") : null,
    requestId: randomUUID(),
  });
  res.writeHead(response.statusCode, response.headers).end(response.body);
});

server.listen(config.port, "127.0.0.1", () => {
  console.log(`ASTIG API (auth: ${config.authMode}) listening on http://127.0.0.1:${config.port}`);
});

const shutdown = () => server.close(() => void pool.end());
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
