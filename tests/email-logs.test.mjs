/**
 * Tests unitaires du module d'insertion email_logs.
 * Aucune connexion réseau, aucun appel Supabase réel.
 * Le client Supabase est injecté via _supabase pour contrôler le comportement.
 *
 * Usage : npm run test:email-logs
 */

import assert from 'node:assert/strict';
import test from 'node:test';

import { insertEmailLog } from '../server/emails/log.js';

// ─── Helpers de mock ──────────────────────────────────────────────────────────

/** Client Supabase mock qui accepte toutes les insertions. */
function mockClientOk(captured = []) {
  return {
    from: () => ({
      insert: async (row) => {
        captured.push(row);
        return { error: null };
      },
    }),
  };
}

/** Client Supabase mock dont l'insertion retourne une erreur Supabase. */
function mockClientError(msg = 'permission denied') {
  return {
    from: () => ({
      insert: async () => ({ error: { message: msg } }),
    }),
  };
}

/** Client Supabase mock dont l'insertion lève une exception JS. */
function mockClientThrows(msg = 'network error') {
  return {
    from: () => ({
      insert: async () => { throw new Error(msg); },
    }),
  };
}

// ─── Tests insertEmailLog ─────────────────────────────────────────────────────

test('insertEmailLog: ne lève pas si _supabase est null (client indisponible)', async () => {
  await assert.doesNotReject(() =>
    insertEmailLog({
      template:  'order-confirmation',
      recipient: 'test@example.com',
      status:    'sent',
      _supabase: null,
    })
  );
});

test('insertEmailLog: ne lève pas si Supabase retourne une erreur d\'insertion', async () => {
  await assert.doesNotReject(() =>
    insertEmailLog({
      template:  'order-confirmation',
      recipient: 'test@example.com',
      status:    'sent',
      _supabase: mockClientError('permission denied'),
    })
  );
});

test('insertEmailLog: ne lève pas si Supabase throw une exception', async () => {
  await assert.doesNotReject(() =>
    insertEmailLog({
      template:  'subscription-confirmation',
      recipient: 'test@example.com',
      status:    'error',
      _supabase: mockClientThrows('connexion perdue'),
    })
  );
});

test('insertEmailLog: insère les bons champs pour un envoi réussi (sent)', async () => {
  const captured = [];
  await insertEmailLog({
    orderId:           'order-uuid-001',
    customerId:        'cust-uuid-002',
    template:          'order-confirmation',
    recipient:         'marie@example.com',
    providerMessageId: 'resend-msg-789',
    status:            'sent',
    metadata:          { source: 'stripe_webhook', stripe_session_id: 'cs_test_xxx' },
    _supabase:         mockClientOk(captured),
  });

  assert.equal(captured.length, 1);
  const row = captured[0];
  assert.equal(row.order_id,            'order-uuid-001');
  assert.equal(row.customer_id,         'cust-uuid-002');
  assert.equal(row.template,            'order-confirmation');
  assert.equal(row.recipient,           'marie@example.com');
  assert.equal(row.provider,            'resend');
  assert.equal(row.provider_message_id, 'resend-msg-789');
  assert.equal(row.status,              'sent');
  assert.equal(row.error_message,       null);
  assert.deepEqual(row.metadata, { source: 'stripe_webhook', stripe_session_id: 'cs_test_xxx' });
});

test('insertEmailLog: insère status=error avec error_message et sans provider_message_id', async () => {
  const captured = [];
  await insertEmailLog({
    template:     'subscription-confirmation',
    recipient:    'jean@example.com',
    status:       'error',
    errorMessage: 'Resend API timeout',
    _supabase:    mockClientOk(captured),
  });

  const row = captured[0];
  assert.equal(row.status,              'error');
  assert.equal(row.error_message,       'Resend API timeout');
  assert.equal(row.provider_message_id, null);
  assert.equal(row.order_id,            null);
  assert.equal(row.customer_id,         null);
});

test('insertEmailLog: champs optionnels nulls par défaut', async () => {
  const captured = [];
  await insertEmailLog({
    template:  'test',
    recipient: 'x@x.com',
    status:    'sent',
    _supabase: mockClientOk(captured),
  });

  const row = captured[0];
  assert.equal(row.order_id,            null);
  assert.equal(row.customer_id,         null);
  assert.equal(row.provider_message_id, null);
  assert.equal(row.error_message,       null);
  assert.deepEqual(row.metadata,        {});
});

// ─── Comportement non-bloquant dans le contexte webhook ───────────────────────

test('insertEmailLog avec erreur Supabase : le code appelant peut continuer normalement', async () => {
  let afterLog = false;

  await insertEmailLog({
    template:  'order-confirmation',
    recipient: 'x@x.com',
    status:    'sent',
    _supabase: mockClientError('RLS policy violation'),
  });

  afterLog = true; // ce code doit s'exécuter
  assert.ok(afterLog, 'Le code après insertEmailLog doit toujours s\'exécuter');
});

test('insertEmailLog avec throw Supabase : le code appelant peut continuer normalement', async () => {
  let afterLog = false;

  await insertEmailLog({
    template:  'order-confirmation',
    recipient: 'x@x.com',
    status:    'sent',
    _supabase: mockClientThrows('timeout'),
  });

  afterLog = true;
  assert.ok(afterLog, 'Le code après insertEmailLog doit toujours s\'exécuter');
});
