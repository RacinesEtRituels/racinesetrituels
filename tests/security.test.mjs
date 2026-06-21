/**
 * Tests de sécurité — Racines & Rituels.
 * Vérifie les configurations de sécurité par analyse de contenu des fichiers.
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

function read(rel) { return readFileSync(join(ROOT, rel), 'utf8'); }

// ── Secret non exposé ─────────────────────────────────────────────────────────

test('server.js : secret webhook non loggué (pas de .substring(', () => {
  assert.ok(!read('server/server.js').includes('substring(0,'), 'STRIPE_WEBHOOK_SECRET ne doit pas être loggué');
});

test('server.js : log webhook conditionnel (guard NODE_ENV)', () => {
  assert.ok(read('server/server.js').includes("NODE_ENV !== 'production'"), 'Le log debug doit être conditionnel');
});

// ── Imports sécurité ──────────────────────────────────────────────────────────

test('server.js : importe helmet', () => {
  assert.ok(read('server/server.js').includes("import helmet from"), 'helmet doit être importé');
});

test('server.js : importe express-rate-limit', () => {
  assert.ok(read('server/server.js').includes("import rateLimit from"), 'express-rate-limit doit être importé');
});

// ── Headers de sécurité ───────────────────────────────────────────────────────

test('server.js : x-powered-by désactivé', () => {
  assert.ok(read('server/server.js').includes("app.disable('x-powered-by')"), 'x-powered-by doit être désactivé');
});

test('server.js : helmet configuré avec CSP', () => {
  const src = read('server/server.js');
  assert.ok(src.includes('contentSecurityPolicy'), 'CSP doit être configuré');
  assert.ok(src.includes('frameAncestors'), "frameAncestors doit être présent dans la CSP");
});

test('server.js : HSTS conditionnel (production uniquement)', () => {
  const src = read('server/server.js');
  assert.ok(src.includes('hsts'), 'HSTS doit être configuré');
  assert.ok(src.includes("NODE_ENV === 'production'"), 'HSTS doit être conditionnel au NODE_ENV');
});

test('server.js : Permissions-Policy configuré', () => {
  assert.ok(read('server/server.js').includes('Permissions-Policy'), 'Permissions-Policy doit être défini');
});

// ── Rate limiting ─────────────────────────────────────────────────────────────

test('server.js : apiLimiter défini (100 req/15 min)', () => {
  const src = read('server/server.js');
  assert.ok(src.includes('apiLimiter'), 'apiLimiter doit être défini');
  assert.ok(src.includes('max: 100'), 'Limite générale doit être 100');
});

test('server.js : adminLimiter défini (20 req/15 min)', () => {
  const src = read('server/server.js');
  assert.ok(src.includes('adminLimiter'), 'adminLimiter doit être défini');
  assert.ok(src.includes('max: 20'), 'Limite admin doit être 20');
});

test('server.js : rate limiting appliqué à /api/admin', () => {
  assert.ok(read('server/server.js').includes("app.use('/api/admin', adminLimiter)"), '/api/admin doit être limité');
});

test('server.js : rate limiting appliqué à /api et /create-checkout-session', () => {
  const src = read('server/server.js');
  assert.ok(src.includes("app.use('/api', apiLimiter)"), '/api doit être limité');
  assert.ok(src.includes("app.use('/create-checkout-session', apiLimiter)"), '/create-checkout-session doit être limité');
});

// ── CORS ──────────────────────────────────────────────────────────────────────

test('server.js : CORS autorise racinesetrituels.com', () => {
  assert.ok(read('server/server.js').includes("'https://racinesetrituels.com'"), 'Le domaine production doit être autorisé');
});

test('server.js : CORS autorise www.racinesetrituels.com', () => {
  assert.ok(read('server/server.js').includes("'https://www.racinesetrituels.com'"), 'Le domaine www doit être autorisé');
});

// ── robots.txt ────────────────────────────────────────────────────────────────

test('robots.txt : checkout bloqué', () => {
  assert.ok(read('public/robots.txt').includes('Disallow: /checkout.html'), '/checkout.html doit être bloqué');
});

test('robots.txt : pages admin bloquées', () => {
  const robots = read('public/robots.txt');
  assert.ok(robots.includes('Disallow: /admin-email-logs.html'), 'admin-email-logs doit être bloqué');
  assert.ok(robots.includes('Disallow: /admin-email-preview.html'), 'admin-email-preview doit être bloqué');
  assert.ok(robots.includes('Disallow: /admin-email-test.html'), 'admin-email-test doit être bloqué');
});

test('robots.txt : /api/ et /webhook/ bloqués', () => {
  const robots = read('public/robots.txt');
  assert.ok(robots.includes('Disallow: /api/'), '/api/ doit être bloqué');
  assert.ok(robots.includes('Disallow: /webhook/'), '/webhook/ doit être bloqué');
});

test('robots.txt : sitemap pointe vers racinesetrituels.com', () => {
  assert.ok(
    read('public/robots.txt').includes('Sitemap: https://racinesetrituels.com/sitemap.xml'),
    'Sitemap doit pointer vers le domaine production'
  );
});
