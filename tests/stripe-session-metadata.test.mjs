import assert from 'node:assert';
import { test } from 'node:test';

const BACKEND = process.env.BACKEND_URL || 'http://127.0.0.1:3000';

async function fetchJson(url, options = {}) {
  const res = await fetch(url, options);
  const text = await res.text();
  let body;
  try {
    body = text ? JSON.parse(text) : {};
  } catch (e) {
    body = { parseError: e.message, raw: text };
  }
  return { res, body, text };
}

test('checkout session carries order id in metadata or client_reference_id', async (t) => {
  let dbgRes, dbgBody;
  try {
    ({ res: dbgRes, body: dbgBody } = await fetchJson(`${BACKEND}/debug/checkout-test`));
  } catch {
    t.skip('Backend non joignable — test ignoré.');
    return;
  }
  if (!dbgRes.ok || !dbgBody?.session_id) {
    t.skip(`backend not reachable or debug route failed (${dbgRes.status})`);
    return;
  }

  const sessionId = dbgBody.session_id;
  const { res: sessRes, body: sessBody } = await fetchJson(`${BACKEND}/debug/stripe-session/${sessionId}`);
  if (!sessRes.ok) {
    t.skip(`stripe session debug route failed (${sessRes.status})`);
    return;
  }

  const metaOrder = sessBody.order_id || null;
  const clientRef = sessBody.client_reference_id || null;
  assert.ok(metaOrder || clientRef, 'checkout session should carry order_id in metadata or client_reference_id');
});
