import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PAGES_DIR = path.join(ROOT, "pages");

function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return;
  const lines = fs.readFileSync(filePath, "utf8").split(/\r?\n/);
  for (const line of lines) {
    const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (!match || process.env[match[1]]) continue;
    process.env[match[1]] = match[2].replace(/^['"]|['"]$/g, "");
  }
}

loadEnvFile(path.join(ROOT, ".env.local"));
loadEnvFile(path.join(ROOT, "server", ".env"));

const PORT = Number(process.env.FRONTEND_PORT || 8000);
const BACKEND_PORT = Number(process.env.PORT || process.env.BACKEND_PORT || 3000);
const BACKEND_URL = (process.env.BACKEND_URL || `http://localhost:${BACKEND_PORT}`).replace(/\/$/, "");

const MIME = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".ico": "image/x-icon",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".txt": "text/plain; charset=utf-8",
  ".webmanifest": "application/manifest+json",
  ".xml": "application/xml; charset=utf-8",
};

function send(res, status, body, type = "text/plain; charset=utf-8") {
  res.writeHead(status, {
    "Cache-Control": "no-store",
    "Content-Type": type,
  });
  res.end(body);
}

function sendFile(res, filePath) {
  fs.readFile(filePath, (err, data) => {
    if (err) return send(res, 404, "Not found");
    const type = MIME[path.extname(filePath).toLowerCase()] || "application/octet-stream";
    res.writeHead(200, {
      "Cache-Control": "no-store",
      "Content-Type": type,
    });
    res.end(data);
  });
}

function safeResolve(baseDir, requestPath) {
  const resolved = path.resolve(baseDir, requestPath.replace(/^\/+/, ""));
  return resolved.startsWith(baseDir + path.sep) || resolved === baseDir ? resolved : null;
}

function pageFile(urlPath) {
  if (urlPath === "/" || urlPath === "") return path.join(PAGES_DIR, "index.html");
  const clean = urlPath.replace(/^\/+/, "");
  if (!clean.endsWith(".html")) return null;
  return safeResolve(PAGES_DIR, clean);
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url || "/", `http://${req.headers.host || `localhost:${PORT}`}`);
  const pathname = decodeURIComponent(url.pathname);

  if (pathname.includes("\0") || pathname.split("/").some((part) => part.startsWith("."))) {
    return send(res, 404, "Not found");
  }

  if (pathname === "/health") {
    return send(res, 200, JSON.stringify({ status: "ok" }), "application/json; charset=utf-8");
  }

  if (pathname === "/public/js/config.js") {
    return send(
      res,
      200,
      `window.__ENV__ = ${JSON.stringify({
        SUPABASE_URL: process.env.SUPABASE_URL || "",
        SUPABASE_ANON_KEY: process.env.SUPABASE_ANON_KEY || "",
        BACKEND_URL,
      })};\n`,
      "text/javascript; charset=utf-8",
    );
  }

  const directRoots = [
    { prefix: "/public/", dir: path.join(ROOT, "public"), strip: "/public/" },
    { prefix: "/components/", dir: path.join(ROOT, "components"), strip: "/components/" },
    { prefix: "/admin/", dir: path.join(ROOT, "admin"), strip: "/admin/" },
  ];

  for (const root of directRoots) {
    if (!pathname.startsWith(root.prefix)) continue;
    const target = safeResolve(root.dir, pathname.slice(root.strip.length));
    if (!target || !fs.existsSync(target) || fs.statSync(target).isDirectory()) {
      return send(res, 404, "Not found");
    }
    return sendFile(res, target);
  }

  const rootAssets = new Set(["/favicon.png", "/favicon.ico", "/manifest.json", "/robots.txt", "/sitemap.xml"]);
  if (rootAssets.has(pathname)) {
    const target = safeResolve(path.join(ROOT, "public"), pathname.slice(1));
    if (target && fs.existsSync(target)) return sendFile(res, target);
  }

  const targetPage = pageFile(pathname);
  if (targetPage && fs.existsSync(targetPage)) return sendFile(res, targetPage);

  return send(res, 404, "Not found");
});

server.listen(PORT, "127.0.0.1", () => {
  console.log(`[FRONTEND] Racines & Rituels static site`);
  console.log(`[FRONTEND] URL: http://127.0.0.1:${PORT}`);
  console.log(`[FRONTEND] Pages root: ${PAGES_DIR}`);
  console.log(`[FRONTEND] Backend URL: ${BACKEND_URL}`);
});
