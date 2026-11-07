/**
 * Tests unitaires — en-tête et pied de page copiés dans les pages.
 * Échoue si un composant a changé sans relancer npm run inline:components.
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { inlineComponents, readComponents } from '../scripts/inline-components.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const pages = readdirSync(join(ROOT, 'pages')).filter(f => f.endsWith('.html'));
const components = readComponents();

test('chaque page est à jour avec components/header.html et footer.html', () => {
  for (const file of pages) {
    const html = readFileSync(join(ROOT, 'pages', file), 'utf8');
    assert.equal(inlineComponents(html, components), html, `${file} : lancer npm run inline:components`);
  }
});

test('aucune page ne garde un placeholder vide', () => {
  for (const file of pages) {
    const html = readFileSync(join(ROOT, 'pages', file), 'utf8');
    assert.ok(!html.includes('<div id="site-header"></div>'), `${file} : en-tête non copié`);
    assert.ok(!html.includes('<div id="site-footer"></div>'), `${file} : pied de page non copié`);
  }
});

test('prix identique : JSON-LD, fiche produit et boutique', () => {
  const boutique = readFileSync(join(ROOT, 'pages', 'boutique.html'), 'utf8');
  for (const slug of ['khamare', 'hibiscus-rouge', 'hibiscus-blanc']) {
    const html = readFileSync(join(ROOT, 'pages', `${slug}.html`), 'utf8');
    const ld = html.match(/"price": "(\d+\.\d{2})"/)[1];
    const affiche = ld.replace('.', ',') + ' €';
    assert.ok(html.includes(`data-testid="product-price">${affiche}</span>`), `${slug} : prix affiché ≠ ${affiche}`);
    const carte = boutique.split(`href="/${slug}.html"`)[1].split('</a>')[0];
    assert.ok(carte.includes(affiche), `boutique, ${slug} : prix ≠ ${affiche}`);
  }
});

test('la copie est idempotente', () => {
  const once = inlineComponents('<div id="site-header"></div>', components);
  assert.equal(inlineComponents(once, components), once);
});
