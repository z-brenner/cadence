import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { createApp } from "../../src/server/app";
const app = createApp();
const env = { DATABASE_URL: process.env.DATABASE_URL!, BETTER_AUTH_SECRET: "x".repeat(40), BETTER_AUTH_URL: "http://localhost:5199", CRON_SECRET: "c" };
const dist = new URL("../../dist", import.meta.url).pathname;
const mime: Record<string,string> = { ".html":"text/html", ".js":"text/javascript", ".css":"text/css" };
http.createServer(async (req, res) => {
  const url = new URL(req.url!, "http://localhost:5199");
  if (url.pathname.startsWith("/api/")) {
    const chunks: Buffer[] = []; for await (const c of req) chunks.push(c as Buffer);
    const r = await app.fetch(new Request(url, { method: req.method, headers: req.headers as any, body: chunks.length ? Buffer.concat(chunks) : undefined }), env);
    res.writeHead(r.status, Object.fromEntries(r.headers)); res.end(Buffer.from(await r.arrayBuffer())); return;
  }
  let f = path.join(dist, url.pathname); if (!fs.existsSync(f) || fs.statSync(f).isDirectory()) f = path.join(dist, "index.html");
  res.writeHead(200, { "content-type": mime[path.extname(f)] ?? "application/octet-stream" }); res.end(fs.readFileSync(f));
}).listen(5199, () => console.log("listening"));
