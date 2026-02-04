import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(new URL('.', import.meta.url).pathname, '..');
const CONFIG_PATH = path.resolve(ROOT, '../js/config.js');
const CONFIG_EXAMPLE_PATH = path.resolve(ROOT, '../js/config.example.js');

function readFileSafe(p) {
  return fs.readFileSync(p, 'utf8');
}

test('js/config.example.js contains placeholder (expected)', () => {
  assert.ok(fs.existsSync(CONFIG_EXAMPLE_PATH), 'js/config.example.js should exist');
  const body = readFileSafe(CONFIG_EXAMPLE_PATH);
  assert.match(body, /sb_publishable_XXXX/, 'Example must keep placeholder');
});

test('js/config.js exists and does not use placeholder', () => {
  assert.ok(
    fs.existsSync(CONFIG_PATH),
    'js/config.js is missing. Copy js/config.example.js to js/config.js and set your anon key.'
  );
  const body = readFileSafe(CONFIG_PATH);
  assert.ok(!body.includes('sb_publishable_XXXX'), 'js/config.js still contains placeholder sb_publishable_XXXX');
  assert.ok(!body.includes('<REPLACE_WITH_SUPABASE_ANON_KEY>'), 'js/config.js still contains <REPLACE_WITH_SUPABASE_ANON_KEY>');
});
