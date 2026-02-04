import test from 'node:test';
import assert from 'node:assert/strict';

// We import lazily inside each test to avoid caching env between cases.
async function loadModule() {
  return import('../js/supabase-public.js');
}

test('validateEnv throws when anon key missing', async () => {
  const { validateEnv } = await loadModule();
  assert.throws(
    () => validateEnv({ SUPABASE_URL: 'http://127.0.0.1:54321', SUPABASE_ANON_KEY: '' }),
    /Missing SUPABASE_ANON_KEY/
  );
});

test('validateEnv throws when url missing', async () => {
  const { validateEnv } = await loadModule();
  assert.throws(
    () => validateEnv({ SUPABASE_URL: '', SUPABASE_ANON_KEY: 'sb_publishable_demo' }),
    /Missing SUPABASE_URL/
  );
});

test('validateEnv rejects placeholder anon key', async () => {
  const { validateEnv } = await loadModule();
  assert.throws(
    () => validateEnv({ SUPABASE_URL: 'http://127.0.0.1:54321', SUPABASE_ANON_KEY: 'sb_publishable_XXXX' }),
    /Missing SUPABASE_ANON_KEY/
  );
});

test('validateEnv returns validated values when provided', async () => {
  const { validateEnv } = await loadModule();
  const env = validateEnv({ SUPABASE_URL: 'http://127.0.0.1:54321', SUPABASE_ANON_KEY: 'sb_publishable_demo' });
  assert.equal(env.url, 'http://127.0.0.1:54321');
  assert.equal(env.anonKey, 'sb_publishable_demo');
});
