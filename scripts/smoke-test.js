#!/usr/bin/env node

const BASE = process.env.BASE_URL || "http://localhost:3000";
const SESSION_ID_TEST = process.env.SESSION_ID_TEST;

const assertJson = async (res) => {
  const text = await res.text();
  try {
    return JSON.parse(text);
  } catch (e) {
    throw new Error(`Non-JSON response (status ${res.status}): ${text}`);
  }
};

const run = async () => {
  // /health
  const health = await fetch(`${BASE}/health`);
  if (!health.ok) throw new Error(`/health failed: ${health.status}`);
  await assertJson(health);

  // /ready
  const ready = await fetch(`${BASE}/ready`);
  if (![200, 503].includes(ready.status)) throw new Error(`/ready unexpected status: ${ready.status}`);
  await assertJson(ready);

  // missing session
  const missing = await fetch(`${BASE}/public/order-by-session`);
  if (missing.status !== 400) throw new Error(`expected 400 for missing session, got ${missing.status}`);
  await assertJson(missing);

  // invalid session
  const invalid = await fetch(`${BASE}/public/order-by-session?session_id=bad`);
  if (invalid.status !== 400) throw new Error(`expected 400 for invalid session, got ${invalid.status}`);
  await assertJson(invalid);

  if (SESSION_ID_TEST) {
    const ok = await fetch(`${BASE}/public/order-by-session?session_id=${encodeURIComponent(SESSION_ID_TEST)}`);
    await assertJson(ok);
  }

  console.log("smoke tests passed");
};

run().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
