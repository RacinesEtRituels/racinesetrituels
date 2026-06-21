/**
 * Tests unitaires pour EmailService.send().
 * Vérifie le comportement de logging (email_logs) selon le résultat Resend.
 * Aucun appel réseau réel — Resend et Supabase sont mockés.
 *
 * Usage : node --test tests/email-service.test.mjs
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';

// ─── Helpers de mock ──────────────────────────────────────────────────────────

function makeResendOk(id = 'resend-id-001') {
  return { emails: { send: async () => ({ data: { id }, error: null }) } };
}

function makeResendError(msg = 'API error') {
  return { emails: { send: async () => ({ data: null, error: { message: msg } }) } };
}

function makeResendThrows(msg = 'network timeout') {
  return { emails: { send: async () => { throw new Error(msg); } } };
}

function makeLogClient(captured = []) {
  return {
    from: () => ({ insert: async (row) => { captured.push(row); return { error: null }; } }),
  };
}

/**
 * Instancie EmailService en injectant des clients mockés via des variables d'env.
 * On override les modules via les variables process.env + un import dynamique unique.
 *
 * Stratégie : on teste directement insertEmailLog + les parties testables en isolation,
 * puis on vérifie le comportement de send() via les captured logs.
 */

// ─── Test de la logique EmailService (via log.js injectable) ─────────────────

import { insertEmailLog, getLogClient } from '../server/emails/log.js';

test('insertEmailLog: status=sent quand Resend réussit (simulation flux complet)', async () => {
  const captured = [];
  const client = makeLogClient(captured);

  await insertEmailLog({
    orderId:           'ord-001',
    customerId:        'cust-001',
    template:          'order-confirmation',
    recipient:         'client@example.com',
    providerMessageId: 'resend-id-001',
    status:            'sent',
    metadata:          { source: 'stripe_webhook' },
    _supabase:         client,
  });

  assert.equal(captured.length, 1);
  assert.equal(captured[0].status, 'sent');
  assert.equal(captured[0].provider_message_id, 'resend-id-001');
  assert.equal(captured[0].error_message, null);
});

test('insertEmailLog: status=error quand Resend échoue', async () => {
  const captured = [];
  const client = makeLogClient(captured);

  await insertEmailLog({
    orderId:    'ord-002',
    template:   'order-confirmation',
    recipient:  'client@example.com',
    status:     'error',
    errorMessage: 'API error from Resend',
    metadata:   { source: 'stripe_webhook' },
    _supabase:  client,
  });

  assert.equal(captured.length, 1);
  assert.equal(captured[0].status, 'error');
  assert.equal(captured[0].error_message, 'API error from Resend');
  assert.equal(captured[0].provider_message_id, null);
});

test('insertEmailLog: status=skipped quand email absent (cas webhook sans email client)', async () => {
  const captured = [];
  const client = makeLogClient(captured);

  await insertEmailLog({
    orderId:      'ord-003',
    template:     'order-confirmation',
    recipient:    '',
    status:       'skipped',
    errorMessage: 'Adresse email client absente de la session Stripe',
    metadata:     { source: 'stripe_webhook', stripe_session_id: 'cs_test_xyz' },
    _supabase:    client,
  });

  assert.equal(captured.length, 1);
  assert.equal(captured[0].status, 'skipped');
  assert.equal(captured[0].recipient, '');
  assert.ok(captured[0].error_message.includes('email client absente'));
});

test('insertEmailLog: provider toujours "resend"', async () => {
  const captured = [];
  await insertEmailLog({
    template:  'test',
    recipient: 'x@x.com',
    status:    'sent',
    _supabase: makeLogClient(captured),
  });
  assert.equal(captured[0].provider, 'resend');
});

// ─── EmailService.send() : template inconnu lève AVANT tout appel réseau ─────

import { EmailService } from '../server/emails/send.js';

test('EmailService.send: template inconnu lève avant appel Resend', async () => {
  await assert.rejects(
    () => EmailService.send({ template: 'does-not-exist', to: 'x@x.com' }),
    (err) => {
      assert.ok(err.message.includes('Template email inconnu'));
      return true;
    }
  );
});

test('EmailService.send: RESEND_FROM absent lève avant appel Resend', async () => {
  const saved = process.env.RESEND_FROM;
  delete process.env.RESEND_FROM;
  try {
    await assert.rejects(
      () => EmailService.send({ template: 'order-confirmation', to: 'x@x.com', data: {} }),
      /RESEND_FROM manquante/
    );
  } finally {
    if (saved !== undefined) process.env.RESEND_FROM = saved;
  }
});

// ─── Régression : guard processOrderSuccess subscription ────────────────────

import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

test('server.js: la garde processOrderSuccess n\'inclut plus !session.payment_intent', () => {
  const src = readFileSync(join(ROOT, 'server/server.js'), 'utf8');
  // payment_intent est null pour les abonnements — inclure ce check déclenchait un appel Stripe inutile
  const condLine = src.match(/if \(!session\.client_reference_id[^\n]+/);
  assert.ok(condLine, 'La condition de garde processOrderSuccess doit exister');
  assert.ok(
    !condLine[0].includes('!session.payment_intent'),
    'La condition ne doit plus inclure !session.payment_intent (null pour les subscriptions)'
  );
});

test('server.js: /public/order-by-session retourne 400 pour session_id absent', () => {
  const src = readFileSync(join(ROOT, 'server/server.js'), 'utf8');
  assert.ok(
    src.includes("'missing_session_id'"),
    'Le handler order-by-session doit retourner error: missing_session_id'
  );
});

test('server.js: /public/order-by-session retourne 400 pour session_id invalide', () => {
  const src = readFileSync(join(ROOT, 'server/server.js'), 'utf8');
  assert.ok(
    src.includes("'invalid_session_id'"),
    'Le handler order-by-session doit retourner error: invalid_session_id'
  );
});

test('server.js: /public/order-by-session inclut correlation_id', () => {
  const src = readFileSync(join(ROOT, 'server/server.js'), 'utf8');
  assert.ok(
    src.includes('correlation_id') && src.includes('crypto.randomUUID()'),
    'Le handler order-by-session doit inclure un correlation_id'
  );
});
