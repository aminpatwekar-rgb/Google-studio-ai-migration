import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT || 3000);
const CLIENT_DIR = path.resolve(__dirname, "dist/client");
const DIST_DIR = path.resolve(__dirname, "dist");

const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf",
  ".txt": "text/plain; charset=utf-8",
};

let serverHandlerPromise;
async function getServerHandler() {
  if (!serverHandlerPromise) {
    serverHandlerPromise = import("./dist/server/server.js").then((m) => m.default);
  }
  return serverHandlerPromise;
}

const server = http.createServer(async (req, res) => {
  try {
    const host = req.headers.host || `localhost:${PORT}`;
    const url = new URL(req.url || "/", `http://${host}`);
    const pathname = decodeURIComponent(url.pathname);

    // 1. Static asset serving from dist/client or dist
    let filePath = path.join(CLIENT_DIR, pathname);
    if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
      filePath = path.join(DIST_DIR, pathname);
    }

    if (pathname !== "/" && fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
      const ext = path.extname(filePath).toLowerCase();
      const contentType = MIME_TYPES[ext] || "application/octet-stream";
      res.writeHead(200, {
        "Content-Type": contentType,
        "Cache-Control": ext === ".html" ? "no-cache" : "public, max-age=31536000, immutable",
      });
      fs.createReadStream(filePath).pipe(res);
      return;
    }

    // 2. Dynamic SSR + Server functions handling
    const ssr = await getServerHandler();
    const headers = new Headers();
    for (const [key, val] of Object.entries(req.headers)) {
      if (Array.isArray(val)) {
        for (const v of val) headers.append(key, v);
      } else if (val !== undefined) {
        headers.set(key, val);
      }
    }

    const hasBody = req.method !== "GET" && req.method !== "HEAD";
    const body = hasBody ? req : undefined;

    const request = new Request(url.toString(), {
      method: req.method,
      headers,
      body,
      // @ts-expect-error duplex required for streaming body in Node
      duplex: hasBody ? "half" : undefined,
    });

    const response = await ssr.fetch(request, {}, {});

    const respHeaders = {};
    for (const [k, v] of response.headers.entries()) {
      respHeaders[k] = v;
    }
    res.writeHead(response.status, respHeaders);

    if (response.body) {
      const reader = response.body.getReader();
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        res.write(value);
      }
    }
    res.end();
  } catch (err) {
    console.error("Server error:", err);
    if (!res.headersSent) {
      res.writeHead(500, { "Content-Type": "text/plain" });
    }
    res.end("Internal Server Error");
  }
});

server.listen(PORT, "0.0.0.0", () => {
  console.log(`Server listening on 0.0.0.0:${PORT}`);
});
