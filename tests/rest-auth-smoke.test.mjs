import assert from 'node:assert';
import { test } from 'node:test';

const FRONT_BASE = process.env.BASE_URL || 'http://127.0.0.1:8000';
const SUPABASE_URL = process.env.SUPABASE_URL || 'http://127.0.0.1:54321';
const CONFIG_URL = `${FRONT_BASE}/js/config.js`;

const isPublishable = (value) => /^sb_publishable_[A-Za-z0-9_-]+$/.test(value);
const isLegacyJwt = (value) => /^eyJ[^.]*\.[^.]+\.[^.]+/.test(value);

async function fetchText(url) {
  const res = await fetch(url);
  const body = await res.text();
  return { status: res.status, ok: res.ok, body };
}

function extractAnonKey(body) {
  const match = body.match(/SUPABASE_ANON_KEY\s*[:=]\s*["']([^"']+)["']/);
  assert.ok(match, 'SUPABASE_ANON_KEY missing in served config.js');
  const key = match[1].trim();
  assert.ok(key !== 'sb_publishable_XXXX', 'Served config.js still contains placeholder sb_publishable_XXXX');
  assert.ok(!key.startsWith('sb_secret_'), 'Served config.js must not expose sb_secret_');
  assert.ok(isPublishable(key) || isLegacyJwt(key), 'SUPABASE_ANON_KEY must be sb_publishable_* or legacy anon JWT');
  return key;
}

function maskKey(key) {
  if (isPublishable(key)) return key; // publishable is OK to show fully
  if (!key || !key.startsWith('eyJ')) return key;
  return `${key.slice(0, 12)}...${key.slice(-8)}`;
}

test('REST smoke auth returns 200/206', async () => {
  const cfg = await fetchText(CONFIG_URL);
  assert.ok(cfg.ok, `config.js not reachable (${cfg.status}) at ${CONFIG_URL}`);
  const anonKey = extractAnonKey(cfg.body);

  const isJwt = isLegacyJwt(anonKey);

  const restUrl = `${SUPABASE_URL}/rest/v1/products?select=id&limit=1`;
  const resp = await fetch(restUrl, {
    headers: {
      apikey: anonKey,
      ...(isJwt ? { Authorization: `Bearer ${anonKey}` } : {}),
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
  });

  const body = await resp.text();
  const okStatuses = [200, 206];
  assert.ok(
    okStatuses.includes(resp.status),
    `Unexpected status ${resp.status} from products. Body=${body || '<empty>'}. Served key=${maskKey(anonKey)}. Mode=${
      isJwt ? 'jwt+auth' : 'publishable-apikey'
    }`
  );
});
