// Code influenceur : mémorisé 30 jours quand un visiteur arrive via un lien ?ref=CODE,
// puis envoyé au backend au moment du paiement.
const STORAGE_KEY = 'rr_ref';
const TTL_MS = 30 * 24 * 60 * 60 * 1000;
const CODE_RE = /^[A-Z0-9_-]{3,30}$/;

export function normalizePromoCode(value) {
  const code = String(value || '').trim().toUpperCase();
  return CODE_RE.test(code) ? code : '';
}

export function getStoredPromoCode() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
    if (!saved || Date.now() - saved.at > TTL_MS) return '';
    return normalizePromoCode(saved.code);
  } catch {
    return '';
  }
}

export function storePromoCode(code) {
  try {
    if (code) localStorage.setItem(STORAGE_KEY, JSON.stringify({ code, at: Date.now() }));
    else localStorage.removeItem(STORAGE_KEY);
  } catch {}
}

export function captureReferralFromUrl() {
  const params = new URLSearchParams(window.location.search);
  const code = normalizePromoCode(params.get('ref') || params.get('code'));
  if (code) storePromoCode(code);
}
