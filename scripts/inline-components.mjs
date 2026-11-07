// Copie components/header.html et components/footer.html dans chaque page de pages/.
// Les robots qui n'exécutent pas le JavaScript (ChatGPT, Perplexity, aperçus de liens)
// voient ainsi le menu et ses liens dès le HTML. header-loader.js et footer-loader.js
// ne refont plus le fetch quand le contenu est déjà là.
//
// Après toute modification d'un composant : npm run inline:components
// Le test tests/components-inline.test.mjs échoue si une page n'est plus à jour.
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const PAGES = join(ROOT, 'pages');

const NOTE = 'Copié de components/%s.html par scripts/inline-components.mjs (npm run inline:components) : ne pas modifier ici';

export function inlineComponents(html, components) {
  let out = html;
  for (const [name, content] of Object.entries(components)) {
    // Placeholder vide, ou déjà rempli par une exécution précédente (idempotent)
    const re = new RegExp(`<div id="site-${name}">(?:</div>|<!-- ${NOTE.replace('%s', name).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')} -->[\\s\\S]*?<!-- /site-${name} --></div>)`);
    const filled = `<div id="site-${name}"><!-- ${NOTE.replace('%s', name)} -->\n${content.trim()}\n<!-- /site-${name} --></div>`;
    out = out.replace(re, () => filled);
  }
  return out;
}

export function readComponents() {
  return {
    header: readFileSync(join(ROOT, 'components', 'header.html'), 'utf8'),
    footer: readFileSync(join(ROOT, 'components', 'footer.html'), 'utf8'),
  };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const components = readComponents();
  let changed = 0;
  for (const file of readdirSync(PAGES).filter(f => f.endsWith('.html'))) {
    const path = join(PAGES, file);
    const before = readFileSync(path, 'utf8');
    const after = inlineComponents(before, components);
    if (after !== before) {
      writeFileSync(path, after);
      changed++;
      console.log('mis à jour :', file);
    }
  }
  console.log(`${changed} page(s) modifiée(s).`);
}
