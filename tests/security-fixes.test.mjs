/**
 * Régressions de sécurité — affiliation (MFA), route d'email de test, échappement HTML.
 * Aucun appel réseau : Supabase est simulé, les documents sont rendus en mémoire.
 *
 * Usage : node --test tests/security-fixes.test.mjs
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { requireAffiliateManagerWith, supabaseActivityAccess } from '../server/affiliate-auth.js';
import { renderInvoice } from '../server/documents/invoice.js';
import { renderPreparationSlip } from '../server/documents/preparation-slip.js';
import { orderConfirmationHtml } from '../server/emails/templates/order-confirmation.js';
import { subscriptionConfirmationHtml } from '../server/emails/templates/subscription-confirmation.js';
import { renderLayout } from '../server/emails/templates/layout.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => readFileSync(join(ROOT, rel), 'utf8');

// ── U3 : gestion des influenceurs ─────────────────────────────────────────────

function run(middleware, headers = {}) {
  return new Promise((resolve) => {
    const res = {
      statusCode: 200,
      status(code) { this.statusCode = code; return this; },
      json(body) { resolve({ status: this.statusCode, body, next: false }); },
    };
    middleware({ headers }, res, () => resolve({ status: 200, next: true }));
  });
}

const ACTIVITY = '23823b14-7ed5-4ce2-a35d-87d1715ac95a';
// Simule la base partagée : can_access_activity() renvoie la décision prévue pour ce jeton.
function fakeSupabase(decisions, calls = []) {
  return (url, key, options) => ({
    rpc: async (name, args) => {
      const token = options.global.headers.Authorization.slice(7);
      calls.push({ key, token, name, args });
      const decision = decisions[token];
      return decision instanceof Error ? { data: null, error: { message: decision.message } } : { data: decision, error: null };
    },
  });
}
const validUser = async (jwt) => (jwt === 'expired'
  ? { data: { user: null }, error: { message: 'jwt expired' } }
  : { data: { user: { id: `user-${jwt}` } }, error: null });

function guard(decisions, calls) {
  return requireAffiliateManagerWith({
    adminSecret: 'site-secret',
    checkAccess: (token) => supabaseActivityAccess({
      createClient: fakeSupabase(decisions, calls), url: 'https://example.supabase.co',
      anonKey: 'anon-key', activityId: ACTIVITY, getUser: validUser,
    })(token),
  });
}

test('affiliation : propriétaire sans second facteur (aal1) refusé', async () => {
  // can_access_activity() renvoie false : profil mfa_required sans session aal2.
  const result = await run(guard({ 'owner-aal1': false }), { authorization: 'Bearer owner-aal1' });
  assert.equal(result.status, 403);
  assert.equal(result.next, false);
});

test('affiliation : propriétaire avec second facteur (aal2) accepté', async () => {
  const result = await run(guard({ 'owner-aal2': true }), { authorization: 'Bearer owner-aal2' });
  assert.equal(result.next, true);
});

test('affiliation : Fanta (membre de l’activité) acceptée, autre compte refusé', async () => {
  const decisions = { fanta: true, autre: false };
  assert.equal((await run(guard(decisions), { authorization: 'Bearer fanta' })).next, true);
  assert.equal((await run(guard(decisions), { authorization: 'Bearer autre' })).status, 403);
});

test('affiliation : la décision est demandée avec le jeton de l’appelant, pour Racines & Rituels', async () => {
  const calls = [];
  await run(guard({ fanta: true }, calls), { authorization: 'Bearer fanta' });
  assert.deepEqual(calls, [{ key: 'anon-key', token: 'fanta', name: 'can_access_activity', args: { p_activity_id: ACTIVITY } }]);
});

test('affiliation : sans jeton ou session expirée → 401, sans interroger la base', async () => {
  const calls = [];
  assert.equal((await run(guard({}, calls), {})).status, 401);
  assert.equal((await run(guard({}, calls), { authorization: 'Bearer expired' })).status, 401);
  assert.equal(calls.length, 0);
});

test('affiliation : erreur de vérification → 503 générique, jamais d’accès', async () => {
  const result = await run(guard({ boom: new Error('connection refused at 10.0.0.1') }), { authorization: 'Bearer boom' });
  assert.equal(result.status, 503);
  assert.ok(!JSON.stringify(result.body).includes('10.0.0.1'), 'le détail technique ne doit pas être renvoyé');
});

test('affiliation : clé publique absente → refus (fail closed)', async () => {
  const middleware = requireAffiliateManagerWith({
    adminSecret: undefined,
    checkAccess: (token) => supabaseActivityAccess({ createClient: fakeSupabase({ x: true }), url: 'u', anonKey: '', activityId: ACTIVITY, getUser: validUser })(token),
  });
  assert.equal((await run(middleware, { authorization: 'Bearer x' })).status, 503);
});

test('affiliation : le mot de passe admin du site reste accepté ; un faux est refusé', async () => {
  assert.equal((await run(guard({}), { 'x-admin-secret': 'site-secret' })).next, true);
  assert.equal((await run(guard({}), { 'x-admin-secret': 'faux' })).status, 401);
});

test('server.js : le contrôle d’affiliation ne lit plus user_profiles avec la clé serveur', () => {
  const server = read('server/server.js');
  assert.ok(server.includes('requireAffiliateManagerWith({'));
  assert.ok(!/from\('user_profiles'\)\.select\('role'\)/.test(server));
});

// ── U4 : route d'email de test ────────────────────────────────────────────────

test('server.js : /api/test-email exige le mot de passe admin', () => {
  assert.match(read('server/server.js'), /app\.post\("\/api\/test-email", adminLimiter, requireAdmin, async/);
});

test('admin-email-test.html : envoie le mot de passe admin avec la demande', () => {
  assert.ok(read('pages/admin-email-test.html').includes("headers: { 'x-admin-secret': secret }"));
});

// ── U5 : échappement HTML ─────────────────────────────────────────────────────

const HOSTILE = '<img src=x onerror="alert(1)">';
function assertEscaped(html, label) {
  assert.ok(!html.includes('<img src=x'), `${label} : balise injectée interprétée`);
  assert.ok(html.includes('&lt;img src=x onerror=&quot;alert(1)&quot;&gt;'), `${label} : texte attendu affiché littéralement`);
}
const shipping = { name: HOSTILE, address1: HOSTILE, address2: HOSTILE, postcode: '75011', city: HOSTILE, country: 'FR' };

test('facture : nom, email, adresse, produit et code promo échappés', () => {
  const html = renderInvoice({
    invoice_number: 'FAC-2026-0001', order_number: 'RR-2026-0001', ordered_at: '2026-10-26T10:00:00Z',
    customer: { full_name: HOSTILE, email: HOSTILE }, shipping: { ...shipping, name: 'Autre destinataire' },
    items: [{ product_name: HOSTILE, qty: 1, unit_sale_price_ttc_cents: 600 }],
    total_ttc_cents: 600, discount_cents: 60, promo_code: HOSTILE,
  });
  assertEscaped(html, 'facture');
  assert.ok(html.includes('Racines &amp; Rituels'), 'le balisage du modèle reste intact');
});

test('bon de préparation : adresse, produit, SKU et notes échappés', () => {
  const html = renderPreparationSlip({
    order_number: 'RR-2026-0001', customer: { full_name: HOSTILE }, shipping,
    items: [{ product_name: HOSTILE, qty: 2, product_sku: HOSTILE }], notes: HOSTILE,
  });
  assertEscaped(html, 'bon de préparation');
});

test('email de confirmation de commande : champs client échappés', () => {
  const html = orderConfirmationHtml({
    customerName: HOSTILE, orderNumber: 'RR-2026-0001', items: [{ name: HOSTILE, quantity: 1, price: '6,00 €' }],
    total: '6,00 €', shippingName: HOSTILE, shippingAddress: HOSTILE, discount: '- 0,60 €', promoCode: HOSTILE,
  });
  assertEscaped(html, 'confirmation de commande');
  assert.ok(html.includes('6,00 €'), 'les montants restent lisibles');
});

test('email de confirmation d’abonnement : nom et formule échappés', () => {
  assertEscaped(subscriptionConfirmationHtml({ customerName: HOSTILE, planName: HOSTILE, amount: '7,00 € / mois', renewalDate: '26/11/2026' }), 'abonnement');
});

test('layout email : le titre est échappé', () => {
  const html = renderLayout({ title: 'Commande — Racines & Rituels', body: '<p>Contenu</p>' });
  assert.ok(html.includes('<title>Commande — Racines &amp; Rituels</title>'));
  assert.ok(html.includes('<p>Contenu</p>'), 'le corps fourni par les modèles reste du HTML');
});
