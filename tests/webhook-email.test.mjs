/**
 * Tests unitaires des helpers de construction des données email.
 * Aucune connexion réseau, aucun appel Stripe ou Supabase.
 *
 * Usage : npm run test:webhook-email
 */

import assert from 'node:assert/strict';
import test from 'node:test';

import { buildOrderConfirmationData, buildSubscriptionConfirmationData } from '../server/emails/order-email.js';

// ─── Fixtures ──────────────────────────────────────────────────────────────────

const SESSION_FULL = {
  customer_details: { email: 'marie@example.com', name: 'Marie Dupont' },
};

const ORDER_ITEMS = [
  { products: { name: 'Khamaré' },       qty: 1, unit_sale_price_ttc_cents: 1200 },
  { products: { name: 'Hibiscus Rouge' }, qty: 2, unit_sale_price_ttc_cents:  600 },
];

// ─── Tests buildOrderConfirmationData ─────────────────────────────────────────

test('buildOrderConfirmationData: structure les champs email correctement', () => {
  const { customerEmail, emailData } = buildOrderConfirmationData({
    session:     SESSION_FULL,
    orderId:     'RR-2026-0042',
    orderItems:  ORDER_ITEMS,
    customer:    null,
  });

  assert.equal(customerEmail, 'marie@example.com');
  assert.equal(emailData.customerName, 'Marie Dupont');
  assert.equal(emailData.orderNumber, 'RR-2026-0042');
  assert.equal(emailData.items.length, 2);
});

test('buildOrderConfirmationData: formate le prix et le total en euros', () => {
  const { emailData } = buildOrderConfirmationData({
    session:    SESSION_FULL,
    orderId:    'RR-001',
    orderItems: ORDER_ITEMS,
    customer:   null,
  });

  // item[0] : 1200 cents → "12,00 €"
  assert.equal(emailData.items[0].price, '12,00 €');
  assert.equal(emailData.items[0].quantity, 1);
  // item[1] : 600 cents → "6,00 €"
  assert.equal(emailData.items[1].price, '6,00 €');
  assert.equal(emailData.items[1].quantity, 2);
  // total : 1*1200 + 2*600 = 2400 cents → "24,00 €"
  assert.equal(emailData.total, '24,00 €');
});

test('buildOrderConfirmationData: customerEmail null si session.customer_details absente', () => {
  const { customerEmail } = buildOrderConfirmationData({
    session:    { customer_details: null },
    orderId:    'RR-002',
    orderItems: [],
    customer:   null,
  });

  assert.equal(customerEmail, null);
});

test('buildOrderConfirmationData: utilise customer.full_name si session.name absent', () => {
  const { emailData } = buildOrderConfirmationData({
    session:    { customer_details: { email: 'x@x.com', name: null } },
    orderId:    'RR-003',
    orderItems: [],
    customer:   { full_name: 'Jean Dupont' },
  });

  assert.equal(emailData.customerName, 'Jean Dupont');
});

test('buildOrderConfirmationData: fallback "Client" si aucun nom disponible', () => {
  const { emailData } = buildOrderConfirmationData({
    session:    { customer_details: { email: 'x@x.com', name: null } },
    orderId:    'RR-004',
    orderItems: [],
    customer:   null,
  });

  assert.equal(emailData.customerName, 'Client');
});

test('buildOrderConfirmationData: items vide → total 0,00 €', () => {
  const { emailData } = buildOrderConfirmationData({
    session:    SESSION_FULL,
    orderId:    'RR-005',
    orderItems: [],
    customer:   null,
  });

  assert.equal(emailData.items.length, 0);
  assert.equal(emailData.total, '0,00 €');
});

test('buildOrderConfirmationData: nom produit absent → fallback "Produit"', () => {
  const { emailData } = buildOrderConfirmationData({
    session:    SESSION_FULL,
    orderId:    'RR-006',
    orderItems: [{ products: null, qty: 1, unit_sale_price_ttc_cents: 500 }],
    customer:   null,
  });

  assert.equal(emailData.items[0].name, 'Produit');
});

test('buildOrderConfirmationData: orderItems null → traité comme tableau vide', () => {
  const { emailData } = buildOrderConfirmationData({
    session:    SESSION_FULL,
    orderId:    'RR-007',
    orderItems: null,
    customer:   null,
  });

  assert.equal(emailData.items.length, 0);
  assert.equal(emailData.total, '0,00 €');
});

// ─── Tests buildSubscriptionConfirmationData ───────────────────────────────────

const SUB_ITEMS_MONTHLY = [
  { products: { name: 'Box Bien-être Mensuel', type: 'subscription' }, qty: 1, unit_sale_price_ttc_cents: 700 },
];
const SUB_ITEMS_ANNUAL = [
  { products: { name: 'Box Bien-être Annuel', type: 'subscription' }, qty: 1, unit_sale_price_ttc_cents: 6900 },
];

test('buildSubscriptionConfirmationData: structure les champs correctement', () => {
  const { customerEmail, emailData } = buildSubscriptionConfirmationData({
    session:          SESSION_FULL,
    orderItems:       SUB_ITEMS_MONTHLY,
    customer:         null,
    renewalTimestamp: null,
  });

  assert.equal(customerEmail, 'marie@example.com');
  assert.equal(emailData.customerName, 'Marie Dupont');
  assert.equal(emailData.planName, 'Box Bien-être Mensuel');
});

test('buildSubscriptionConfirmationData: formule mensuelle → "mois" dans amount', () => {
  const { emailData } = buildSubscriptionConfirmationData({
    session:          SESSION_FULL,
    orderItems:       SUB_ITEMS_MONTHLY,
    customer:         null,
    renewalTimestamp: null,
  });

  assert.equal(emailData.amount, '7,00 € / mois');
  assert.equal(emailData.renewalDate, '—');
});

test('buildSubscriptionConfirmationData: formule annuelle → "an" dans amount', () => {
  const { emailData } = buildSubscriptionConfirmationData({
    session:          SESSION_FULL,
    orderItems:       SUB_ITEMS_ANNUAL,
    customer:         null,
    renewalTimestamp: null,
  });

  assert.equal(emailData.amount, '69,00 € / an');
});

test('buildSubscriptionConfirmationData: renewalTimestamp → date française formatée', () => {
  // 2026-07-21 00:00:00 UTC → "21/07/2026" en fr-FR
  const ts = Math.floor(new Date('2026-07-21T00:00:00Z').getTime() / 1000);
  const { emailData } = buildSubscriptionConfirmationData({
    session:          SESSION_FULL,
    orderItems:       SUB_ITEMS_MONTHLY,
    customer:         null,
    renewalTimestamp: ts,
  });

  assert.ok(emailData.renewalDate.includes('2026'), `Date attendue avec 2026, obtenu: ${emailData.renewalDate}`);
  assert.ok(emailData.renewalDate.includes('07'), `Mois attendu 07, obtenu: ${emailData.renewalDate}`);
  assert.ok(emailData.renewalDate.includes('21'), `Jour attendu 21, obtenu: ${emailData.renewalDate}`);
});

test('buildSubscriptionConfirmationData: customerEmail null si pas de session.customer_details', () => {
  const { customerEmail } = buildSubscriptionConfirmationData({
    session:          { customer_details: null },
    orderItems:       SUB_ITEMS_MONTHLY,
    customer:         null,
    renewalTimestamp: null,
  });

  assert.equal(customerEmail, null);
});

test('buildSubscriptionConfirmationData: fallback planName si aucun produit subscription', () => {
  const { emailData } = buildSubscriptionConfirmationData({
    session:          SESSION_FULL,
    orderItems:       [], // pas de produit subscription
    customer:         null,
    renewalTimestamp: null,
  });

  assert.equal(emailData.planName, 'Abonnement Racines & Rituels');
  assert.equal(emailData.amount, '0,00 € / mois');
});
