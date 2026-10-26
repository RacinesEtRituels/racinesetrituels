/**
 * Traitement des commandes payées — paiement confirmé, reprise après erreur, aucun doublon.
 * Supabase, Stripe et Resend sont simulés en mémoire : aucun appel réseau.
 *
 * Usage : node --test tests/order-processing.test.mjs
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createOrderProcessor } from '../server/order-processing.js';
import { buildOrderConfirmationData, buildSubscriptionConfirmationData, buildOrderNotificationData } from '../server/emails/order-email.js';

const ACTIVITY = 'activity-rr';

// ── Base simulée : juste ce que le traitement utilise ─────────────────────────
function fakeDb(seed) {
  const tables = structuredClone(seed);
  const failures = {}; // nom d'opération → nombre d'échecs à simuler
  const calls = [];
  const fail = (name) => { if (failures[name] > 0) { failures[name]--; return { message: `${name} indisponible` }; } return null; };

  function query(table) {
    const filters = [];
    let op = 'select', payload = null, single = null, wantRows = false;
    const rows = () => (tables[table] ||= []).filter((r) => filters.every((f) => f(r)));
    const builder = {
      select() { wantRows = true; return builder; },
      update(values) { op = 'update'; payload = values; return builder; },
      insert(values) { op = 'insert'; payload = values; return builder; },
      eq(k, v) { filters.push((r) => r[k] === v); return builder; },
      neq(k, v) { filters.push((r) => r[k] !== v); return builder; },
      is(k, v) { filters.push((r) => (r[k] ?? null) === v); return builder; },
      in(k, vs) { filters.push((r) => vs.includes(r[k])); return builder; },
      order() { return builder; },
      limit() { return builder; },
      maybeSingle() { single = 'maybe'; return builder; },
      single() { single = 'one'; return builder; },
      then(resolve, reject) { return Promise.resolve().then(run).then(resolve, reject); },
    };
    function run() {
      const error = fail(`${op}:${table}`);
      if (error) return { data: null, error };
      calls.push(`${op}:${table}`);
      let result;
      if (op === 'insert') {
        const list = (Array.isArray(payload) ? payload : [payload]).map((r) => ({ id: `${table}-${tables[table]?.length ?? 0}`, ...r }));
        if (table === 'affiliate_commissions' && list.some((r) => tables[table]?.some((x) => x.order_id === r.order_id))) {
          return { data: null, error: { code: '23505', message: 'duplicate' } };
        }
        (tables[table] ||= []).push(...list);
        result = list;
      } else if (op === 'update') {
        result = rows();
        result.forEach((r) => Object.assign(r, payload));
      } else {
        result = rows().map((r) => table === 'order_items' ? { ...r, products: tables.products.find((p) => p.id === r.product_id) } : r);
      }
      if (single) return { data: result[0] ?? null, error: single === 'one' && !result[0] ? { message: 'aucune ligne' } : null };
      return { data: wantRows || op === 'select' ? result : null, error: null };
    }
    return builder;
  }

  let counter = 0;
  const db = {
    from: query,
    async rpc(name, args) {
      const error = fail(`rpc:${name}`);
      if (error) return { data: null, error };
      calls.push(`rpc:${name}`);
      if (name === 'next_document_number') return { data: `${args.p_prefix}-2026-${String(++counter).padStart(args.p_padding, '0')}`, error: null };
      if (name === 'decrement_stock_for_order') {
        const order = tables.orders.find((o) => o.id === args.order_id);
        if (order.payment_status !== 'paid') return { data: null, error: { message: 'non payée' } };
        if (order.stock_decremented_at) return { data: null, error: null };
        for (const item of tables.order_items.filter((i) => i.order_id === order.id)) {
          tables.products.find((p) => p.id === item.product_id).stock -= item.qty;
        }
        order.stock_decremented_at = 'now';
        return { data: null, error: null };
      }
      throw new Error(`rpc inattendue ${name}`);
    },
  };
  return { db, tables, failures, calls };
}

function setup({ session: sessionPatch = {} } = {}) {
  const env = fakeDb({
    orders: [{ id: 'order-1', payment_status: 'pending', status: 'pending', order_number: null, invoice_number: null, notes: null }],
    order_items: [{ order_id: 'order-1', product_id: 'khamare', qty: 2, unit_sale_price_ttc_cents: 600 }],
    products: [{ id: 'khamare', name: 'Khamaré', type: 'unit', stock: 10 }],
    customers: [], email_logs: [], affiliates: [], affiliate_commissions: [], subscriptions: [],
  });
  const sent = [];
  let emailFailures = 0;
  let now = Date.parse('2026-10-26T12:00:00Z');
  const EmailService = {
    async send({ template, to, orderId }) {
      if (emailFailures > 0) {
        emailFailures--;
        env.tables.email_logs.push({ order_id: orderId, template, status: 'error' });
        throw new Error('Resend indisponible');
      }
      sent.push(template);
      env.tables.email_logs.push({ order_id: orderId, template, recipient: to, status: 'sent' });
      return { id: `msg-${sent.length}` };
    },
  };
  const stripe = {
    checkout: { sessions: { retrieve: async () => ({ total_details: { amount_discount: 0, amount_shipping: 590, breakdown: { discounts: [] } }, line_items: { data: [] } }) } },
    subscriptions: { retrieve: async () => ({ current_period_end: null }) },
  };
  const processor = createOrderProcessor({
    supabase: env.db, stripe, EmailService,
    insertEmailLog: async (log) => { env.tables.email_logs.push({ order_id: log.orderId, template: log.template, status: log.status }); },
    activityId: ACTIVITY, notificationRecipients: ['commandes@racinesetrituels.com'],
    isSubscriptionProduct: (p) => p?.type === 'subscription', subscriptionBillingCycle: () => 'monthly',
    buildOrderConfirmationData, buildSubscriptionConfirmationData, buildOrderNotificationData,
    clock: () => now,
  });
  const session = {
    id: 'cs_test_1', client_reference_id: 'order-1', metadata: { order_id: 'order-1' }, mode: 'payment',
    payment_status: 'paid', customer: 'cus_1', payment_intent: 'pi_1',
    customer_details: { email: 'client@example.com', name: 'Client Test' }, ...sessionPatch,
  };
  return {
    ...env, sent, session, processor,
    order: () => env.tables.orders[0],
    stock: () => env.tables.products[0].stock,
    failEmailsTimes: (n) => { emailFailures = n; },
    wait: (ms) => { now += ms; },
  };
}

// ── U2 : paiement réellement reçu ─────────────────────────────────────────────

test('paiement différé non reçu (unpaid) : aucune préparation, commande non payée', async () => {
  const t = setup({ session: { payment_status: 'unpaid' } });
  assert.deepEqual(await t.processor.processOrderSuccess(t.session), { status: 'awaiting_payment' });
  assert.equal(t.order().payment_status, 'pending');
  assert.equal(t.stock(), 10);
  assert.deepEqual(t.sent, []);
});

test('paiement différé confirmé ensuite : commande traitée une seule fois', async () => {
  const t = setup({ session: { payment_status: 'unpaid' } });
  await t.processor.processOrderSuccess(t.session);
  const succeeded = { ...t.session, payment_status: 'paid' };
  assert.deepEqual(await t.processor.processOrderSuccess(succeeded), { status: 'completed' });
  t.wait(10 * 60 * 1000);
  await t.processor.processOrderSuccess(succeeded); // relivraison du même événement
  assert.equal(t.stock(), 8);
  assert.deepEqual(t.sent, ['order-confirmation', 'order-notification']);
});

test('échec du paiement différé : la commande ne passe jamais en payée', async () => {
  const t = setup({ session: { payment_status: 'unpaid' } });
  assert.deepEqual(await t.processor.recordAsyncPaymentFailure(t.session), { status: 'payment_failed' });
  assert.equal(t.order().payment_status, 'pending');
});

test('commande entièrement remisée (no_payment_required) : traitée', async () => {
  const t = setup({ session: { payment_status: 'no_payment_required' } });
  assert.deepEqual(await t.processor.processOrderSuccess(t.session), { status: 'completed' });
});

// ── U1 : chaque étape reprend après une erreur ────────────────────────────────

test('commande normale : numéros, client, stock et deux emails', async () => {
  const t = setup();
  assert.deepEqual(await t.processor.processOrderSuccess(t.session), { status: 'completed' });
  assert.equal(t.order().payment_status, 'paid');
  assert.match(t.order().order_number, /^RR-2026-/);
  assert.match(t.order().invoice_number, /^FAC-2026-/);
  assert.ok(t.order().customer_id, 'client lié');
  assert.equal(t.stock(), 8);
  assert.deepEqual(t.sent, ['order-confirmation', 'order-notification']);
});

test('panne sur la liaison client : erreur renvoyée à Stripe, reprise complète à la relivraison', async () => {
  const t = setup();
  t.failures['insert:customers'] = 1;
  await assert.rejects(t.processor.processOrderSuccess(t.session), /incomplète : client/);
  assert.equal(t.order().customer_id, undefined);
  t.wait(5 * 60 * 1000);
  assert.deepEqual(await t.processor.processOrderSuccess(t.session), { status: 'completed' });
  assert.ok(t.order().customer_id, 'client lié à la reprise');
  assert.equal(t.stock(), 8, 'stock décrémenté une seule fois');
  assert.deepEqual(t.sent, ['order-confirmation', 'order-notification'], 'aucun email en double');
});

test('panne de numérotation : emails retenus, puis envoyés avec les numéros', async () => {
  const t = setup();
  t.failures['rpc:next_document_number'] = 1;
  await assert.rejects(t.processor.processOrderSuccess(t.session), /numérotation/);
  assert.deepEqual(t.sent, [], 'pas d’email sans numéro de commande');
  t.wait(5 * 60 * 1000);
  await t.processor.processOrderSuccess(t.session);
  assert.ok(t.order().order_number && t.order().invoice_number);
  assert.deepEqual(t.sent, ['order-confirmation', 'order-notification']);
});

test('panne du stock : relivrée jusqu’à décrémentation, sans double décrément', async () => {
  const t = setup();
  t.failures['rpc:decrement_stock_for_order'] = 1;
  await assert.rejects(t.processor.processOrderSuccess(t.session), /stock/);
  assert.equal(t.stock(), 10);
  t.wait(5 * 60 * 1000);
  await t.processor.processOrderSuccess(t.session);
  t.wait(5 * 60 * 1000);
  await t.processor.processOrderSuccess(t.session);
  assert.equal(t.stock(), 8);
});

test('email client en échec : renvoyé une seule fois à la reprise, l’email interne n’est pas dupliqué', async () => {
  const t = setup();
  t.failEmailsTimes(1); // le premier envoi (confirmation client) échoue
  await assert.rejects(t.processor.processOrderSuccess(t.session), /email de confirmation/);
  assert.deepEqual(t.sent, ['order-notification']);
  t.wait(5 * 60 * 1000);
  await t.processor.processOrderSuccess(t.session);
  assert.deepEqual(t.sent, ['order-notification', 'order-confirmation']);
});

test('relivraison pendant le traitement initial : refusée pour être retentée plus tard', async () => {
  const t = setup();
  await t.processor.processOrderSuccess(t.session);
  t.wait(30 * 1000);
  await assert.rejects(t.processor.processOrderSuccess(t.session), /en cours de traitement/);
  assert.deepEqual(t.sent, ['order-confirmation', 'order-notification']);
});

test('journal des emails illisible : aucun envoi à l’aveugle, reprise ensuite', async () => {
  const t = setup();
  t.failures['select:email_logs'] = 2;
  await assert.rejects(t.processor.processOrderSuccess(t.session), /email/);
  assert.deepEqual(t.sent, []);
  t.wait(5 * 60 * 1000);
  await t.processor.processOrderSuccess(t.session);
  assert.deepEqual(t.sent, ['order-confirmation', 'order-notification']);
});
