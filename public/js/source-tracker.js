// source-tracker.js — Racines & Rituels
// D'où vient le visiteur (Google, ChatGPT, Perplexity…) ? Compté côté serveur, sans
// identifiant ni stockage sur l'appareil. La source n'est mémorisée (30 jours, pour
// l'attribuer à une commande) que si le visiteur a accepté la mesure d'audience.

const CLE = 'rr_source';
const DUREE_MS = 30 * 24 * 60 * 60 * 1000;

const SOURCES = [
  ['chatgpt', /(^|\.)(chatgpt\.com|chat\.openai\.com)$/],
  ['perplexity', /(^|\.)perplexity\.ai$/],
  ['claude', /(^|\.)claude\.ai$/],
  ['copilot', /(^|\.)copilot\.microsoft\.com$/],
  ['google', /(^|\.)google\.[a-z.]+$/],
  ['bing', /(^|\.)bing\.com$/],
  ['duckduckgo', /(^|\.)duckduckgo\.com$/],
  ['autre_moteur', /(^|\.)(qwant\.com|ecosia\.org|yahoo\.com|search\.brave\.com|yandex\.[a-z]+|startpage\.com|lilo\.org)$/],
];

function sourceDeHote(hote) {
  const trouvee = SOURCES.find(([, motif]) => motif.test(hote));
  return trouvee ? trouvee[0] : null;
}

function detecter() {
  // ChatGPT et d'autres assistants ajoutent ?utm_source=chatgpt.com à leurs liens.
  const utm = new URLSearchParams(location.search).get('utm_source');
  if (utm) {
    const source = sourceDeHote(utm.toLowerCase()) || (['google', 'bing', 'chatgpt', 'perplexity', 'claude', 'copilot', 'duckduckgo'].includes(utm.toLowerCase()) ? utm.toLowerCase() : null);
    if (source) return source;
  }
  if (!document.referrer) return null; // visite directe : non comptée
  let hote;
  try { hote = new URL(document.referrer).hostname.toLowerCase(); } catch (e) { return null; }
  if (hote === location.hostname || hote.endsWith('.racinesetrituels.com') || hote === 'racinesetrituels.com') return null;
  return sourceDeHote(hote) || 'autre_site';
}

function analyticsAccepte() {
  try { return !!(JSON.parse(localStorage.getItem('rr_cookie_consent') || 'null') || {}).analytics; }
  catch (e) { return false; }
}

function memoriser(source) {
  try { localStorage.setItem(CLE, JSON.stringify({ source, date: Date.now() })); } catch (e) {}
}

// Source à joindre à une commande : seulement celle mémorisée avec consentement.
window.rrSourceAcquisition = function () {
  if (!analyticsAccepte()) return null;
  try {
    const m = JSON.parse(localStorage.getItem(CLE) || 'null');
    return m && Date.now() - m.date < DUREE_MS ? m.source : null;
  } catch (e) { return null; }
};

export function suivreSource() {
  // Un rechargement ou un retour arrière garde le même référent : ce n'est pas une nouvelle arrivée.
  const nav = performance.getEntriesByType && performance.getEntriesByType('navigation')[0];
  if (nav && nav.type !== 'navigate') return;

  const source = detecter();
  if (!source) return;

  fetch('/api/visite', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ source, page: location.pathname }),
    keepalive: true,
  }).catch(() => {});

  if (analyticsAccepte()) memoriser(source);
  else window.addEventListener('rr:consent', (e) => { if (e.detail && e.detail.analytics) memoriser(source); }, { once: true });
}
