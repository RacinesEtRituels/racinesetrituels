import assert from 'node:assert/strict';
import { test, before } from 'node:test';

const SUPABASE_URL = process.env.SUPABASE_URL || 'http://127.0.0.1:54321';
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || '<REPLACE_WITH_SUPABASE_ANON_KEY>';
const isPlaceholder = (val) => !val || val.includes('<REPLACE_WITH_SUPABASE_ANON_KEY>');

before(async () => {
  let res;
  try {
    res = await fetch(`${SUPABASE_URL}/rest/v1/`);
  } catch (err) {
    throw new Error(`Supabase is not running (expected at ${SUPABASE_URL}). Start supabase and retry.`);
  }

  if (!res) {
    throw new Error(`Supabase did not respond at ${SUPABASE_URL}.`);
  }
});

test('REST without auth returns 401', async () => {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/products?select=id&limit=1`);
  assert.equal(res.status, 401, `Expected 401 without headers, got ${res.status}`);
});

test('REST with anon headers returns 200 and JSON array (skip if no key)', async (t) => {
  if (isPlaceholder(SUPABASE_ANON_KEY)) {
    t.skip('SUPABASE_ANON_KEY not provided; skipping auth success test');
  }

  const res = await fetch(`${SUPABASE_URL}/rest/v1/products?select=id&limit=1`, {
    headers: {
      apikey: SUPABASE_ANON_KEY,
      Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
    },
  });

  assert.equal(res.status, 200, `Expected 200 with anon headers, got ${res.status}`);
  const data = await res.json();
  assert.ok(Array.isArray(data), 'Expected JSON array response');
});
