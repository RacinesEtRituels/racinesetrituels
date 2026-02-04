import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..');
const runtimeConfigPath = path.join(repoRoot, 'js', 'config.js');

const PLACEHOLDER = 'sb_publishable_XXXX';
const JWT_REGEX = /SUPABASE_ANON_KEY\s*[:=]\s*["']?eyJ[^.]*\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/;
const STRIPE_REGEX = /SUPABASE_ANON_KEY\s*[:=]\s*["']?sb_[A-Za-z0-9_-]+/i;

test('runtime config js/config.js exists and is non-placeholder', () => {
  assert.ok(
    fs.existsSync(runtimeConfigPath),
    `js/config.js is missing at ${runtimeConfigPath}. Copy js/config.example.js to js/config.js and set your Supabase ANON JWT.`
  );
  const body = fs.readFileSync(runtimeConfigPath, 'utf8');
  assert.ok(!body.includes(PLACEHOLDER), 'js/config.js still contains placeholder sb_publishable_XXXX');
  assert.ok(!STRIPE_REGEX.test(body), 'js/config.js contains a Stripe-like sb_ key, not a Supabase JWT');
  assert.ok(JWT_REGEX.test(body), 'js/config.js does not contain a JWT-like SUPABASE_ANON_KEY (eyJ... with 3 parts)');
});
