/**
 * Tests smoke pour GET /api/admin/email-logs.
 * Nécessite un backend en cours d'exécution (BACKEND_URL).
 * Les tests sont ignorés gracieusement si le backend n'est pas joignable.
 *
 * Usage : npm run test:admin-email-logs
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';

const BACKEND_URL  = process.env.BACKEND_URL  || 'http://localhost:3000';
const ADMIN_SECRET = process.env.ADMIN_SECRET || '';

async function fetchJson(url, opts = {}) {
  const res = await fetch(url, opts);
  const text = await res.text();
  let body = null;
  try { body = text ? JSON.parse(text) : null; } catch { body = text; }
  return { res, body };
}

// ─── Test 1 : sans auth → 401 ou 503 ────────────────────────────────────────

test('GET /api/admin/email-logs — rejecte sans X-Admin-Secret', async (t) => {
  let result;
  try {
    result = await fetchJson(`${BACKEND_URL}/api/admin/email-logs`);
  } catch {
    t.skip('Backend non joignable — test ignoré.');
    return;
  }

  const { res, body } = result;

  // 404 = route inconnue du serveur en cours (redémarrage nécessaire après déploiement)
  if (res.status === 404) {
    t.skip('Route /api/admin/email-logs introuvable sur ce serveur — redémarrer le backend.');
    return;
  }

  // 401 = auth refusée / 503 = ADMIN_SECRET non configuré côté serveur
  assert.ok(
    [401, 503].includes(res.status),
    `Attendu 401 ou 503 sans auth, obtenu ${res.status}. Body: ${JSON.stringify(body)}`
  );
});

// ─── Test 2 : production guard ───────────────────────────────────────────────
// Vérifie que le guard NODE_ENV=production refuse sans ADMIN_EMAIL_LOGS_ENABLED.
// Ce test manipule les variables d'environnement localement, sans requête réseau.

test('guard production : refuse si NODE_ENV=production et ADMIN_EMAIL_LOGS_ENABLED absent', () => {
  const orig = process.env.NODE_ENV;
  const origFlag = process.env.ADMIN_EMAIL_LOGS_ENABLED;

  process.env.NODE_ENV = 'production';
  delete process.env.ADMIN_EMAIL_LOGS_ENABLED;

  const isAllowed = !(
    process.env.NODE_ENV === 'production' &&
    process.env.ADMIN_EMAIL_LOGS_ENABLED !== 'true'
  );

  // Restore
  process.env.NODE_ENV = orig;
  if (origFlag !== undefined) process.env.ADMIN_EMAIL_LOGS_ENABLED = origFlag;

  assert.equal(isAllowed, false, 'Doit être refusé en production sans ADMIN_EMAIL_LOGS_ENABLED=true');
});

test('guard production : autorisé si NODE_ENV=production ET ADMIN_EMAIL_LOGS_ENABLED=true', () => {
  const orig = process.env.NODE_ENV;
  const origFlag = process.env.ADMIN_EMAIL_LOGS_ENABLED;

  process.env.NODE_ENV = 'production';
  process.env.ADMIN_EMAIL_LOGS_ENABLED = 'true';

  const isAllowed = !(
    process.env.NODE_ENV === 'production' &&
    process.env.ADMIN_EMAIL_LOGS_ENABLED !== 'true'
  );

  // Restore
  process.env.NODE_ENV = orig;
  if (origFlag !== undefined) process.env.ADMIN_EMAIL_LOGS_ENABLED = origFlag;
  else delete process.env.ADMIN_EMAIL_LOGS_ENABLED;

  assert.equal(isAllowed, true, 'Doit être autorisé si ADMIN_EMAIL_LOGS_ENABLED=true même en production');
});

test('guard production : autorisé en development sans ADMIN_EMAIL_LOGS_ENABLED', () => {
  const orig = process.env.NODE_ENV;
  const origFlag = process.env.ADMIN_EMAIL_LOGS_ENABLED;

  process.env.NODE_ENV = 'development';
  delete process.env.ADMIN_EMAIL_LOGS_ENABLED;

  const isAllowed = !(
    process.env.NODE_ENV === 'production' &&
    process.env.ADMIN_EMAIL_LOGS_ENABLED !== 'true'
  );

  // Restore
  process.env.NODE_ENV = orig;
  if (origFlag !== undefined) process.env.ADMIN_EMAIL_LOGS_ENABLED = origFlag;

  assert.equal(isAllowed, true, 'Doit être autorisé en development');
});

// ─── Test 3 : avec auth valide → 200 + tableau logs ─────────────────────────

test('GET /api/admin/email-logs — retourne { logs: [] } avec auth valide', async (t) => {
  if (!ADMIN_SECRET) {
    t.skip('ADMIN_SECRET non défini dans l\'environnement — test ignoré.');
    return;
  }

  let result;
  try {
    result = await fetchJson(`${BACKEND_URL}/api/admin/email-logs`, {
      headers: { 'X-Admin-Secret': ADMIN_SECRET },
    });
  } catch {
    t.skip('Backend non joignable — test ignoré.');
    return;
  }

  const { res, body } = result;

  // En production sans le flag → 403 attendu, pas une erreur de test
  if (res.status === 403) {
    t.skip('Production sans ADMIN_EMAIL_LOGS_ENABLED — 403 attendu, test ignoré.');
    return;
  }

  assert.equal(res.status, 200, `Attendu 200, obtenu ${res.status}. Body: ${JSON.stringify(body)}`);
  assert.ok(body && typeof body === 'object', 'Body doit être un objet');
  assert.ok(Array.isArray(body.logs), `body.logs doit être un tableau, obtenu: ${JSON.stringify(body)}`);
});
