#!/usr/bin/env node

// Minimal smoke to verify front/back/CORS + order-by-session end to end.
const FRONT_URL = process.env.FRONT_URL || "http://localhost:8000";
const BACKEND_URL = process.env.BACKEND_URL || "http://localhost:3000";
const SESSION_ID = process.env.SESSION_ID;
const ORIGINS = ["http://localhost:8000", "http://127.0.0.1:8000"];

let failed = false;

const logResult = (name, ok, detail = "") => {
  const status = ok ? "PASS" : "FAIL";
  const suffix = detail ? ` - ${detail}` : "";
  console.log(`[${status}] ${name}${suffix}`);
  if (!ok) failed = true;
};

const check = async (name, fn) => {
  try {
    await fn();
    logResult(name, true);
  } catch (err) {
    logResult(name, false, err?.message || String(err));
  }
};

const expect = (cond, msg) => {
  if (!cond) throw new Error(msg);
};

await check("front /success.html (200, text/html)", async () => {
  const res = await fetch(`${FRONT_URL}/success.html`);
  expect(res.ok, `HTTP ${res.status}`);
  const ct = res.headers.get("content-type") || "";
  expect(ct.includes("text/html"), `content-type=${ct}`);
});

await check("backend /health (200)", async () => {
  const res = await fetch(`${BACKEND_URL}/health`);
  expect(res.ok, `HTTP ${res.status}`);
});

for (const origin of ORIGINS) {
  await check(`CORS /health (${origin})`, async () => {
    const res = await fetch(`${BACKEND_URL}/health`, { headers: { Origin: origin } });
    expect(res.ok, `HTTP ${res.status}`);
    const allow = res.headers.get("access-control-allow-origin");
    expect(allow === origin, `access-control-allow-origin=${allow || "(none)"}`);
  });
}

await check("order-by-session ok:true", async () => {
  if (!SESSION_ID) throw new Error("SESSION_ID non défini");
  const res = await fetch(`${BACKEND_URL}/public/order-by-session?session_id=${encodeURIComponent(SESSION_ID)}`);
  expect(res.ok, `HTTP ${res.status}`);
  const payload = await res.json();
  expect(payload && payload.ok === true, "payload.ok !== true");
});

process.exit(failed ? 1 : 0);
