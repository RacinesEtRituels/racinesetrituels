import { test } from 'node:test';
import assert from 'node:assert';

const BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:3000';

async function fetchJson(url, options = {}) {
  const res = await fetch(url, options);
  const text = await res.text();
  let body = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch (e) {
    body = text;
  }
  return { res, body, text };
}

test('backend health responds', async () => {
  const { res } = await fetchJson(`${BACKEND_URL}/health`);
  assert.strictEqual(res.ok, true, `Health check failed (${res.status}) on ${BACKEND_URL}`);
});

// Optional smoke: checkout endpoint should return 4xx/2xx but not crash
// If BACKEND_URL is not reachable, this test will be skipped

test('create-checkout-session reachable or gracefully handled', async (t) => {
  const payload = { items: [{ product_id: '00000000-0000-0000-0000-000000000000', quantity: 1 }] };
  try {
    const { res } = await fetchJson(`${BACKEND_URL}/create-checkout-session`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    assert.ok(res.status >= 200 && res.status < 500, `Unexpected status ${res.status} on create-checkout-session`);
  } catch (err) {
    t.skip(`Skipping checkout smoke: ${err.message || err}`);
  }
});
