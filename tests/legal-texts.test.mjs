/**
 * Textes contractuels et documents : délais légaux, identité du vendeur, prix au kilogramme.
 *
 * Usage : node --test tests/legal-texts.test.mjs
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { renderInvoice } from '../server/documents/invoice.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => readFileSync(join(ROOT, rel), 'utf8');
const text = (rel) => read(rel).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');

test('rétractation : remboursement compté depuis la décision, report possible jusqu’au retour (L221-24)', () => {
  const page = text('pages/retractation-retours.html');
  assert.match(page, /au plus tard 14 jours après avoir été informés de votre décision de vous rétracter/);
  assert.match(page, /L221-24/);
  assert.ok(!page.includes('à compter de la réception du retour ou, si antérieur'), 'ancien point de départ retiré');
});

test('CGV : délai de livraison par défaut de 30 jours et risques jusqu’à la remise au client', () => {
  const cgv = text('pages/cgv.html');
  assert.match(cgv, /au plus tard 30 jours après la conclusion du contrat/);
  assert.match(cgv, /L216-4/);
  assert.ok(!cgv.includes('ne constituent pas un engagement contractuel ferme'));
  assert.ok(!cgv.includes('responsabilité du transporteur est engagée dès la remise'));
});

test('plateforme européenne RLL (fermée en 2025) retirée des pages', () => {
  for (const page of ['pages/cgv.html', 'pages/mediateur-consommation.html']) {
    assert.ok(!read(page).includes('ec.europa.eu/consumers/odr'), page);
  }
});

test('facture : identité complète du vendeur et mention TVA', () => {
  const html = renderInvoice({ invoice_number: 'FAC-2026-00001', items: [] });
  for (const mention of ['Alexandre BOEHLER, entrepreneur individuel', '24 Rue Gilbert Ollier', '38780 Pont-Évêque', 'SIREN 484 314 174', 'contact@racinesetrituels.com']) {
    assert.ok(html.includes(mention), mention);
  }
  assert.match(html, /293\s*B/);
});

test('facture : identité du vendeur identique aux mentions légales', () => {
  const mentions = text('pages/mentions-legales.html');
  assert.match(mentions, /484 314 174/);
  assert.match(mentions, /24 Rue Gilbert Ollier/);
});

test('prix au kilogramme affiché sur les fiches et la boutique', () => {
  for (const page of ['pages/khamare.html', 'pages/hibiscus-rouge.html', 'pages/hibiscus-blanc.html']) {
    assert.match(read(page), /price_cents \* 10 \/ 100\).toFixed\(2\).replace\('\.', ','\) \+ ' € le kg'/, page);
  }
  const shop = text('pages/boutique.html');
  assert.match(shop, /12,00 € Sachet de 100 g · soit 120,00 € le kg/);
  assert.equal((shop.match(/6,00 € Sachet de 100 g · soit 60,00 € le kg/g) || []).length, 2);
});

test('webhook : paiements différés gérés, erreurs de traitement renvoyées à Stripe', () => {
  const server = read('server/server.js');
  assert.ok(server.includes('"checkout.session.async_payment_succeeded"'));
  assert.ok(server.includes('"checkout.session.async_payment_failed"'));
  assert.match(server, /res\.status\(500\)\.json\(\{ error: "Traitement incomplet/);
});
