import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..');
// Config is served dynamically by the backend — static file is optional.
const runtimeConfigPath = path.join(repoRoot, 'public', 'js', 'config.js');

const PLACEHOLDER = 'sb_publishable_XXXX';
const JWT_REGEX = /SUPABASE_ANON_KEY\s*[:=]\s*["']?eyJ[^.]*\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/;
const STRIPE_REGEX = /SUPABASE_ANON_KEY\s*[:=]\s*["']?sb_[A-Za-z0-9_-]+/i;

test('runtime config public/js/config.js has no placeholder if it exists (skip when absent — config is dynamic)', (t) => {
  if (!fs.existsSync(runtimeConfigPath)) {
    t.skip('public/js/config.js absent (config injected dynamically by backend at /public/js/config.js — ok).');
    return;
  }
  const body = fs.readFileSync(runtimeConfigPath, 'utf8');
  assert.ok(!body.includes(PLACEHOLDER), 'public/js/config.js still contains placeholder sb_publishable_XXXX');
  assert.ok(!STRIPE_REGEX.test(body), 'public/js/config.js contains a Stripe-like sb_ key, not a Supabase JWT');
  assert.ok(JWT_REGEX.test(body), 'public/js/config.js does not contain a JWT-like SUPABASE_ANON_KEY (eyJ... with 3 parts)');
});
