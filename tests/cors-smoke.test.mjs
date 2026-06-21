import test from "node:test";
import assert from "node:assert/strict";

const BASE = process.env.BACKEND_URL || "http://localhost:3000";
const ORIGINS = ["http://localhost:8000", "http://127.0.0.1:8000"];

const safeFetch = async (url, options = {}) => {
  try {
    const res = await fetch(url, options);
    let body = null;
    try { body = await res.json(); } catch (_) { body = null; }
    return { res, body };
  } catch (err) {
    return { err };
  }
};

const assertCors = (res, origin) => {
  const acao = res.headers.get("access-control-allow-origin");
  assert.equal(acao, origin, "Access-Control-Allow-Origin should echo origin");
};

for (const origin of ORIGINS) {
  test(`CORS preflight allows POST from ${origin}`, async (t) => {
    const { res, err } = await safeFetch(`${BASE}/create-checkout-session`, {
      method: "OPTIONS",
      headers: {
        Origin: origin,
        "Access-Control-Request-Method": "POST",
        "Access-Control-Request-Headers": "Content-Type",
      },
    });
    if (err) { t.skip(`Backend non joignable : ${err.message}`); return; }
    assert.equal(res.status, 204);
    assertCors(res, origin);
    const methods = res.headers.get("access-control-allow-methods") || "";
    assert.ok(/POST/i.test(methods), "AC-Allow-Methods must include POST");
  });

  test(`CORS GET /health echoes origin ${origin}`, async (t) => {
    const { res, err } = await safeFetch(`${BASE}/health`, {
      headers: { Origin: origin },
    });
    if (err) { t.skip(`Backend non joignable : ${err.message}`); return; }
    assert.equal(res.status, 200);
    assertCors(res, origin);
  });
}

test("/public/order-by-session missing_session_id → 400 + correlation_id", async (t) => {
  const { res, body, err } = await safeFetch(`${BASE}/public/order-by-session`);
  if (err) { t.skip(`Backend non joignable : ${err.message}`); return; }
  assert.equal(res.status, 400);
  assert.equal(body?.ok, false);
  assert.equal(body?.error, "missing_session_id");
  assert.equal(body?.status, 400);
  assert.ok(typeof body?.correlation_id === "string" && body.correlation_id.length > 0);
});

test("/public/order-by-session invalid_session_id → 400 + correlation_id", async (t) => {
  const { res, body, err } = await safeFetch(`${BASE}/public/order-by-session?session_id=bad`);
  if (err) { t.skip(`Backend non joignable : ${err.message}`); return; }
  assert.equal(res.status, 400);
  assert.equal(body?.ok, false);
  assert.equal(body?.error, "invalid_session_id");
  assert.equal(body?.status, 400);
  assert.ok(typeof body?.correlation_id === "string" && body.correlation_id.length > 0);
});
