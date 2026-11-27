import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'fs';
import {
  PRODUITS_GOOGLE, estDisponible, appliquerDisponibilite, fluxGoogle,
  dateLivraisonEstimee, creerLecteurProduits, appliquerProduit,
} from '../server/merchant.js';

const page = (slug) => readFileSync(new URL(`../pages/${slug}.html`, import.meta.url), 'utf8');

test('disponible seulement si actif et stock > 0', () => {
  assert.equal(estDisponible({ is_active: true, stock: 3 }), true);
  assert.equal(estDisponible({ is_active: true, stock: 0 }), false);
  assert.equal(estDisponible({ is_active: true, stock: null }), false);
  assert.equal(estDisponible({ is_active: false, stock: 5 }), false);
  assert.equal(estDisponible(undefined), false);
});

test('chaque page produit a une seule disponibilité et la bonne référence', () => {
  for (const p of PRODUITS_GOOGLE) {
    const html = page(p.slug);
    assert.equal(html.split('"availability": "https://schema.org/InStock"').length - 1, 1, p.slug);
    assert.ok(html.includes(`"sku": "${p.sku}"`), p.slug);
    const epuise = appliquerDisponibilite(html, false);
    assert.ok(epuise.includes('"availability": "https://schema.org/OutOfStock"'));
    assert.ok(!epuise.includes('schema.org/InStock'));
    assert.equal(appliquerDisponibilite(html, true), html);
    assert.equal(appliquerDisponibilite(epuise, true), html, 'retour en stock');
    assert.ok(appliquerDisponibilite(html, true).includes('"sku"'));
    // Le JSON-LD reste valide après remplacement
    const blocs = [...epuise.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)];
    for (const b of blocs) JSON.parse(b[1]);
  }
});

test('flux Google : prix, stock et échappement', () => {
  const produits = new Map([
    ['hibiscus-rouge', { slug: 'hibiscus-rouge', price_cents: 600, stock: 18, is_active: true }],
    ['khamare', { slug: 'khamare', price_cents: 1200, stock: 0, is_active: true }],
  ]);
  const xml = fluxGoogle(produits);
  assert.ok(xml.includes('<g:id>RR-HIBISCUS-ROUGE-100G</g:id>'));
  assert.ok(xml.includes('<g:price>6.00 EUR</g:price>'));
  assert.ok(xml.includes('<g:price>12.00 EUR</g:price>'));
  assert.match(xml, /RR-KHAMARE-100G[\s\S]*?out_of_stock/);
  assert.ok(!xml.includes('RR-HIBISCUS-BLANC-100G'), 'produit absent de la base : pas dans le flux');
  assert.ok(xml.includes('d&#39;hibiscus'));
  assert.ok(!/&(?!amp;|lt;|gt;|quot;|#39;)/.test(xml), 'aucun & non échappé');
});

test('date de livraison : jours ouvrés', () => {
  // Jeudi 26/11/2026 : +5 jours ouvrés = jeudi 03/12 ; +8 = mardi 08/12
  const jeudi = new Date('2026-11-26T15:00:00Z');
  assert.equal(dateLivraisonEstimee('FR', jeudi), '2026-12-03');
  assert.equal(dateLivraisonEstimee('BE', jeudi), '2026-12-08');
  assert.equal(dateLivraisonEstimee('fr', jeudi), '2026-12-03');
});

test('lecteur de produits : cache et erreur', async () => {
  let appels = 0; let erreur = false; let t = 0;
  const supabase = { from: () => ({ select: () => ({ eq: () => ({ in: async () => {
    appels++;
    return erreur ? { data: null, error: { message: 'panne' } } : { data: [{ slug: 'khamare', stock: 2, is_active: true, price_cents: 1200 }], error: null };
  } }) }) }) };
  const lire = creerLecteurProduits(supabase, { activityId: 'a1', dureeMs: 1000, maintenant: () => t });
  assert.equal((await lire()).get('khamare').stock, 2);
  await lire();
  assert.equal(appels, 1);
  t = 2000; erreur = true;
  assert.equal((await lire()).get('khamare').stock, 2, 'panne : dernière lecture gardée');
  assert.equal(appels, 2);
  const vide = creerLecteurProduits(supabase, { activityId: 'a1' });
  assert.equal(await vide(), null, 'panne sans lecture préalable : null');
});

test('les pages produits désactivent le bouton quand le stock est à 0', () => {
  for (const p of PRODUITS_GOOGLE) {
    const html = page(p.slug);
    assert.ok(html.includes('select=id,name,price_cents,slug,stock'), p.slug);
    assert.ok(html.includes('btn.textContent = "Épuisé"'), p.slug);
  }
});

test('le prix de la base remplace celui écrit dans la page', () => {
  const html = appliquerProduit(page('khamare'), { is_active: true, stock: 0, price_cents: 1350 });
  assert.match(html, /"price": "13\.50"/);
  assert.doesNotMatch(html, /"price": "12\.00"/);
  assert.match(html, /id="productPrice"[^>]*>13,50 €</);
  assert.match(html, /id="productUnitPrice"[^>]*>soit 135,00 € le kg</);
  assert.match(html, /schema\.org\/OutOfStock/);
});

test('prix invalide en base : la page garde son prix', () => {
  const html = appliquerProduit(page('khamare'), { is_active: true, stock: 2, price_cents: null });
  assert.match(html, /"price": "12\.00"/);
});
