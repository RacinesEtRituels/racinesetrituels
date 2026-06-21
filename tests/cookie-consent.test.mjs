/**
 * Tests unitaires — bandeau cookies Racines & Rituels.
 * Vérifie l'existence et le contenu des fichiers clés sans navigateur.
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

// ── 1. cookie-consent.js : existence ─────────────────────────────────────────

test('cookie-consent.js existe dans public/js/', () => {
  const p = join(ROOT, 'public/js/cookie-consent.js');
  assert.ok(existsSync(p), 'public/js/cookie-consent.js introuvable');
});

// ── 2. cookie-consent.js : clé localStorage ──────────────────────────────────

test('cookie-consent.js contient la clé rr_cookie_consent', () => {
  const src = readFileSync(join(ROOT, 'public/js/cookie-consent.js'), 'utf8');
  assert.ok(src.includes('rr_cookie_consent'), "Clé 'rr_cookie_consent' absente du fichier");
});

// ── 3. cookie-consent.js : API globale ───────────────────────────────────────

test('cookie-consent.js expose RRResetCookieConsent sur window', () => {
  const src = readFileSync(join(ROOT, 'public/js/cookie-consent.js'), 'utf8');
  assert.ok(src.includes('RRResetCookieConsent'), "'RRResetCookieConsent' absent du fichier");
});

// ── 4. cookie-consent.js : boutons Accepter / Refuser / Personnaliser ────────

test('cookie-consent.js contient les trois boutons du bandeau', () => {
  const src = readFileSync(join(ROOT, 'public/js/cookie-consent.js'), 'utf8');
  assert.ok(src.includes('Accepter'), "Bouton 'Accepter' absent");
  assert.ok(src.includes('Refuser'), "Bouton 'Refuser' absent");
  assert.ok(src.includes('Personnaliser'), "Bouton 'Personnaliser' absent");
});

// ── 5. cookie-consent.js : guard double chargement ───────────────────────────

test('cookie-consent.js est protégé contre le double chargement', () => {
  const src = readFileSync(join(ROOT, 'public/js/cookie-consent.js'), 'utf8');
  assert.ok(src.includes('__RR_COOKIE_LOADED__'), 'Guard de double chargement absent');
});

// ── 6. cgv.html existe ───────────────────────────────────────────────────────

test('pages/cgv.html existe', () => {
  assert.ok(existsSync(join(ROOT, 'pages/cgv.html')), 'pages/cgv.html introuvable');
});

// ── 7. cookies.html existe ───────────────────────────────────────────────────

test('pages/cookies.html existe', () => {
  assert.ok(existsSync(join(ROOT, 'pages/cookies.html')), 'pages/cookies.html introuvable');
});

// ── 8. footer.html charge cookie-consent.js ──────────────────────────────────

test('components/footer.html inclut cookie-consent.js', () => {
  const src = readFileSync(join(ROOT, 'components/footer.html'), 'utf8');
  assert.ok(src.includes('cookie-consent.js'), 'cookie-consent.js non référencé dans footer.html');
});
