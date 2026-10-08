/**
 * Tests unitaires des templates email.
 * Vérifie le rendu HTML sans envoyer aucun email.
 *
 * Usage : npm run test:email-templates
 */

import assert from 'node:assert/strict';
import test from 'node:test';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import path from 'path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '..', '.env.local') });

// Imports dynamiques après chargement de l'env
const { renderLayout } = await import('../server/emails/templates/layout.js');
const { testEmailHtml } = await import('../server/emails/templates/test-email.js');
const { orderConfirmationHtml } = await import('../server/emails/templates/order-confirmation.js');
const { subscriptionConfirmationHtml } = await import('../server/emails/templates/subscription-confirmation.js');
const { EmailService } = await import('../server/emails/send.js');

// ─── Layout ──────────────────────────────────────────────────────────────────

test('layout: génère un DOCTYPE HTML valide', () => {
  const html = renderLayout({ title: 'Test', body: '<p>Contenu</p>' });
  assert.ok(html.startsWith('<!DOCTYPE html>'), 'Doit commencer par DOCTYPE');
  assert.ok(html.includes('Racines'), 'Doit contenir la marque');
  assert.ok(html.includes('<p>Contenu</p>'), 'Doit injecter le body');
  assert.ok(html.includes('contact@racinesetrituels.com'), 'Doit contenir le footer');
});

test('layout: bouton CTA présent quand ctaText + ctaUrl fournis', () => {
  const html = renderLayout({
    title: 'Test CTA',
    body: '<p>Corps</p>',
    ctaText: 'Cliquer ici',
    ctaUrl: 'https://example.com/lien',
  });
  assert.ok(html.includes('Cliquer ici'), 'Texte CTA manquant');
  assert.ok(html.includes('https://example.com/lien'), 'URL CTA manquante');
  // Vérifier la version VML Outlook
  assert.ok(html.includes('v:roundrect'), 'Bouton VML Outlook manquant');
});

test('layout: bouton CTA absent quand ctaText nul', () => {
  const html = renderLayout({ title: 'Test', body: '<p>Corps</p>', ctaText: null, ctaUrl: null });
  assert.ok(!html.includes('v:roundrect'), 'Bouton VML ne devrait pas être présent');
});

test('layout: copyright contient l\'année courante', () => {
  const html = renderLayout({ title: 'T', body: '' });
  assert.ok(html.includes(String(new Date().getFullYear())), 'Année copyright manquante');
});

// ─── test-email ───────────────────────────────────────────────────────────────

test('test-email: génère un HTML complet avec les badges DNS', () => {
  const html = testEmailHtml();
  assert.ok(html.includes('Alexandre'), 'Prénom manquant');
  assert.ok(html.includes('Resend'), 'Badge Resend manquant');
  assert.ok(html.includes('DKIM'), 'Badge DKIM manquant');
  assert.ok(html.includes('SPF'), 'Badge SPF manquant');
  assert.ok(html.includes('Racines'), 'Marque manquante dans le header');
});

// ─── order-confirmation ──────────────────────────────────────────────────────

test('order-confirmation: contient nom, numéro, produits et total', () => {
  const html = orderConfirmationHtml({
    customerName: 'Marie Dupont',
    orderNumber: 'RR-2026-0042',
    items: [
      { name: 'Khamaré', quantity: 1, price: '12,00 €' },
      { name: 'Hibiscus Rouge', quantity: 2, price: '6,00 €' },
    ],
    total: '24,00 €',
  });

  assert.ok(html.includes('Marie Dupont'), 'Nom client manquant');
  assert.ok(html.includes('RR-2026-0042'), 'Numéro de commande manquant');
  assert.ok(html.includes('Khama'), 'Produit 1 manquant');
  assert.ok(html.includes('Hibiscus'), 'Produit 2 manquant');
  assert.ok(html.includes('24,00'), 'Total manquant');
  assert.ok(html.includes('Voir ma commande'), 'Bouton CTA manquant');
});

test('order-confirmation: items vide → fallback affiché', () => {
  const html = orderConfirmationHtml({
    customerName: 'Test',
    orderNumber: 'RR-000',
    items: [],
    total: '0,00 €',
  });
  assert.ok(html.includes('non disponible'), 'Message fallback items vide manquant');
});

// ─── subscription-confirmation ───────────────────────────────────────────────

test('subscription-confirmation: contient formule, montant, échéance', () => {
  const html = subscriptionConfirmationHtml({
    customerName: 'Jean Martin',
    planName: 'Box Bien-être Mensuel',
    amount: '7,00 € / mois',
    renewalDate: '21/07/2026',
  });

  assert.ok(html.includes('Jean Martin'), 'Nom client manquant');
  assert.ok(html.includes('Box Bien-être Mensuel'), 'Nom formule manquant');
  assert.ok(html.includes('7,00'), 'Montant manquant');
  assert.ok(html.includes('21/07/2026'), 'Date échéance manquante');
  assert.ok(html.includes('mon espace'), 'Bouton CTA manquant');
});

// ─── EmailService ─────────────────────────────────────────────────────────────

test('EmailService: liste les templates disponibles', () => {
  const tpls = EmailService.templates();
  assert.ok(tpls.includes('order-confirmation'), '"order-confirmation" absent');
  assert.ok(tpls.includes('subscription-confirmation'), '"subscription-confirmation" absent');
  assert.ok(tpls.includes('test'), '"test" absent');
});

test('EmailService: rejette un template inconnu sans appel réseau', async () => {
  await assert.rejects(
    () => EmailService.send({ template: 'inexistant', to: 'x@x.com', data: {} }),
    (err) => {
      assert.ok(err.message.includes('Template email inconnu'), err.message);
      assert.ok(err.message.includes('inexistant'), err.message);
      return true;
    }
  );
});

// ─── Order notification (email interne équipe) ─────────────────────────────

test('order-notification: contient produits, adresse, livraison, code et total', async () => {
  const { orderNotificationHtml } = await import('../server/emails/templates/order-notification.js');
  const { buildOrderNotificationData } = await import('../server/emails/order-email.js');
  const data = buildOrderNotificationData({
    session: { customer_details: { name: 'Awa <Diop>', email: 'awa@example.com' } },
    orderId: 'uuid',
    orderNumber: 'RR-2026-0042',
    orderItems: [{ qty: 2, unit_sale_price_ttc_cents: 600, products: { name: "Fleurs d'Hibiscus Rouge" } }],
    shippingFields: { shipping_name: 'Awa Diop', shipping_address1: '1 rue X', shipping_postcode: '75001', shipping_city: 'Paris', shipping_country: 'FR' },
    discountCents: 120,
    promoCode: 'SOPHIE10',
    shippingCents: 590,
  });
  assert.equal(data.total, '16,70 €');
  const html = orderNotificationHtml(data);
  assert.ok(html.includes('RR-2026-0042'));
  assert.ok(html.includes('Hibiscus Rouge'));
  assert.ok(html.includes('75001 Paris'));
  assert.ok(html.includes('SOPHIE10'));
  assert.ok(html.includes('5,90 €'));
  assert.ok(html.includes('Awa &lt;Diop&gt;'), 'nom client échappé');
  assert.ok(EmailService.templates().includes('order-notification'));
});
