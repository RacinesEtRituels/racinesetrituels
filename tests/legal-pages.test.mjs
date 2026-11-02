/**
 * Tests unitaires — pages légales Racines & Rituels.
 * Vérifie l'existence et le contenu des pages sans navigateur.
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

function read(rel) { return readFileSync(join(ROOT, rel), 'utf8'); }
function exists(rel) { return existsSync(join(ROOT, rel)); }

// ── Existence des pages ───────────────────────────────────────────────────────

test('pages/retractation-retours.html existe', () => {
  assert.ok(exists('pages/retractation-retours.html'));
});

test('pages/mediateur-consommation.html existe', () => {
  assert.ok(exists('pages/mediateur-consommation.html'));
});

test('pages/contact.html existe', () => {
  assert.ok(exists('pages/contact.html'));
});

// ── Email de contact présent dans chaque page ─────────────────────────────────

test('retractation-retours.html contient contact@racinesetrituels.com', () => {
  assert.ok(read('pages/retractation-retours.html').includes('contact@racinesetrituels.com'));
});

test('mediateur-consommation.html contient contact@racinesetrituels.com', () => {
  assert.ok(read('pages/mediateur-consommation.html').includes('contact@racinesetrituels.com'));
});

test('contact.html contient contact@racinesetrituels.com', () => {
  assert.ok(read('pages/contact.html').includes('contact@racinesetrituels.com'));
});

// ── Contenu spécifique ────────────────────────────────────────────────────────

test('médiateur CM2C désigné dans la page médiation et les CGV', () => {
  const src = read('pages/mediateur-consommation.html');
  assert.ok(src.includes('L.616-1'), 'Référence légale L.616-1 absente');
  assert.ok(!src.includes('mediateur-a-completer'), 'Bloc « médiateur non désigné » encore présent');
  for (const page of ['pages/mediateur-consommation.html', 'pages/cgv.html']) {
    const html = read(page);
    assert.ok(html.includes('le processus de médiation des litiges de la consommation'), page);
    assert.ok(html.includes('49 rue de Ponthieu'), page);
    assert.ok(html.includes('href="https://www.cm2c.net/declarer-un-litige.php"'), page);
    assert.ok(html.includes('href="mailto:litiges@cm2c.net"'), page);
  }
});

test('retractation-retours.html contient "14 jours"', () => {
  assert.ok(read('pages/retractation-retours.html').includes('14 jours'));
});

test('retractation-retours.html contient le formulaire de rétractation légal', () => {
  const src = read('pages/retractation-retours.html');
  assert.ok(src.includes('formulaire-content'), 'Bloc formulaire absent');
  assert.ok(src.includes('Numéro de commande'), 'Champ numéro de commande absent');
});

test('contact.html contient un lien vers les CGV', () => {
  assert.ok(read('pages/contact.html').includes('/cgv.html'));
});

test('contact.html contient un lien vers la politique de confidentialité', () => {
  assert.ok(read('pages/contact.html').includes('/confidentialite.html'));
});

// ── SEO canonicals ────────────────────────────────────────────────────────────

test('retractation-retours.html a un canonical racinesetrituels.com', () => {
  assert.ok(read('pages/retractation-retours.html').includes('racinesetrituels.com/retractation-retours.html'));
});

test('mediateur-consommation.html a un canonical racinesetrituels.com', () => {
  assert.ok(read('pages/mediateur-consommation.html').includes('racinesetrituels.com/mediateur-consommation.html'));
});

test('contact.html a un canonical racinesetrituels.com', () => {
  assert.ok(read('pages/contact.html').includes('racinesetrituels.com/contact.html'));
});
