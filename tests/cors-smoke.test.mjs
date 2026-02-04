import test from "node:test";
import assert from "node:assert/strict";

const BASE = "http://localhost:3000";
const ORIGINS = ["http://localhost:8000", "http://127.0.0.1:8000"];

const fetchJson = async (url, options = {}) => {
  const res = await fetch(url, options);
  let body = null;
  try {
    body = await res.json();
  } catch (_) {
    body = null;
  }
  return { res, body };
};

const assertCors = (res, origin) => {
  const acao = res.headers.get("access-control-allow-origin");
  assert.equal(acao, origin, "Access-Control-Allow-Origin should echo origin");
};

for (const origin of ORIGINS) {
  test(`CORS preflight allows POST from ${origin}`, async () => {
    const { res } = await fetch(`${BASE}/create-checkout-session`, {
      method: "OPTIONS",
      headers: {
        Origin: origin,
        "Access-Control-Request-Method": "POST",
        "Access-Control-Request-Headers": "Content-Type",
      },
    });
    assert.equal(res.status, 204);
    assertCors(res, origin);
    const methods = res.headers.get("access-control-allow-methods") || "";
    assert.ok(/POST/i.test(methods), "AC-Allow-Methods must include POST");
  });

  test(`CORS GET /health echoes origin ${origin}`, async () => {
    const { res } = await fetch(`${BASE}/health`, {
      headers: { Origin: origin },
    });
    assert.equal(res.status, 200);
    assertCors(res, origin);
  });
}

test("/public/order-by-session missing_session_id", async () => {
  const { res, body } = await fetchJson(`${BASE}/public/order-by-session`);
  assert.equal(res.status, 400);
  assert.equal(body?.ok, false);
  assert.equal(body?.error, "missing_session_id");
  assert.equal(body?.status, 400);
  assert.ok(typeof body?.correlation_id === "string" && body.correlation_id.length > 0);
});

test("/public/order-by-session invalid_session_id", async () => {
  const { res, body } = await fetchJson(`${BASE}/public/order-by-session?session_id=bad`);
  assert.equal(res.status, 400);
  assert.equal(body?.ok, false);
  assert.equal(body?.error, "invalid_session_id");
  assert.equal(body?.status, 400);
  assert.ok(typeof body?.correlation_id === "string" && body.correlation_id.length > 0);
});
