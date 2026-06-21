import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(new URL('.', import.meta.url).pathname, '..');
const CONFIG_EXAMPLE_PATH = path.resolve(ROOT, 'public/js/config.example.js');

function readFileSafe(p) {
  return fs.readFileSync(p, 'utf8');
}

test('public/js/config.example.js contains placeholder (expected)', () => {
  assert.ok(fs.existsSync(CONFIG_EXAMPLE_PATH), 'public/js/config.example.js should exist');
  const body = readFileSafe(CONFIG_EXAMPLE_PATH);
  assert.ok(
    /sb_publishable_xxx/i.test(body) || /sb_publishable_XXXX/i.test(body),
    'Example must keep a placeholder anon key (sb_publishable_xxx or sb_publishable_XXXX)'
  );
});

// config.js is served dynamically by the backend at /public/js/config.js —
// no static file expected. If a static override exists, verify it has no placeholder.
test('public/js/config.js has no placeholder if it exists (dynamic config: skip when absent)', (t) => {
  const CONFIG_PATH = path.resolve(ROOT, 'public/js/config.js');
  if (!fs.existsSync(CONFIG_PATH)) {
    t.skip('public/js/config.js absent (config served dynamically by backend — ok).');
    return;
  }
  const body = readFileSafe(CONFIG_PATH);
  assert.ok(!body.includes('sb_publishable_XXXX'), 'public/js/config.js still contains placeholder sb_publishable_XXXX');
  assert.ok(!body.includes('<REPLACE_WITH_SUPABASE_ANON_KEY>'), 'public/js/config.js still contains <REPLACE_WITH_SUPABASE_ANON_KEY>');
});
