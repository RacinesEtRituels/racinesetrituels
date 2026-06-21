/* cookie-consent.js — Racines & Rituels
   Bandeau RGPD autonome. Aucune dépendance externe.
   Stockage : localStorage['rr_cookie_consent']
   API globale : window.RRResetCookieConsent()
*/
(function () {
  'use strict';

  if (window.__RR_COOKIE_LOADED__) return;
  window.__RR_COOKIE_LOADED__ = true;

  var KEY = 'rr_cookie_consent';

  /* ── Storage ──────────────────────────────────────────── */

  function readConsent() {
    try { return JSON.parse(localStorage.getItem(KEY) || 'null'); }
    catch (e) { return null; }
  }

  function writeConsent(prefs) {
    try {
      localStorage.setItem(KEY, JSON.stringify({
        necessary: true,
        analytics: !!prefs.analytics,
        marketing: !!prefs.marketing,
        date: new Date().toISOString(),
      }));
    } catch (e) {}
  }

  /* ── Helpers ──────────────────────────────────────────── */

  function el(id) { return document.getElementById(id); }

  function isDark() {
    return document.documentElement.classList.contains('dark') ||
      !!(window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches);
  }

  function hideBar() {
    var bar = el('rr-ck-bar');
    if (!bar) return;
    bar.style.transform = 'translateY(100%)';
    bar.style.opacity = '0';
    setTimeout(function () { if (bar && bar.parentNode) bar.parentNode.removeChild(bar); }, 320);
  }

  /* ── Panneau personnalisation ─────────────────────────── */

  function buildPanel() {
    if (el('rr-ck-panel')) return;

    var dark = isDark();
    var current = readConsent() || {};

    var overlayStyle = [
      'position:fixed', 'inset:0', 'z-index:10001',
      dark ? 'background:rgba(0,0,0,.65)' : 'background:rgba(0,0,0,.35)',
    ].join(';');

    var boxStyle = [
      'position:fixed', 'bottom:0', 'left:0', 'right:0', 'z-index:10002',
      dark ? 'background:#1b110e;border-top:2px solid #3a2318'
           : 'background:#fff;border-top:2px solid #e8ddd8',
      'padding:20px 16px', 'max-height:85vh', 'overflow-y:auto',
      "font-family:'Epilogue',sans-serif",
    ].join(';');

    var titleStyle = 'font-size:1rem;font-weight:700;margin:0 0 4px;' +
      (dark ? 'color:#f3f4f6' : 'color:#1b110e');

    var subtitleStyle = 'font-size:0.79rem;margin:0 0 14px;' +
      (dark ? 'color:#9ca3af' : 'color:#6b7280');

    var rowStyle = [
      'display:flex', 'justify-content:space-between', 'align-items:flex-start',
      'gap:12px', 'padding:11px 0',
      dark ? 'border-bottom:1px solid rgba(255,255,255,.07)'
           : 'border-bottom:1px solid #f3ede6',
    ].join(';');

    var labelStyle = 'font-size:0.87rem;font-weight:600;line-height:1.4;' +
      (dark ? 'color:#f3f4f6' : 'color:#1b110e');

    var descStyle = 'display:block;font-size:0.75rem;font-weight:400;margin-top:2px;' +
      (dark ? 'color:#6b7280' : 'color:#9ca3af');

    var btnSaveStyle = [
      'margin-top:16px', 'width:100%', 'padding:11px 20px',
      'background:#e64c19', 'color:#fff',
      'border:2px solid #e64c19', 'border-radius:6px',
      'font-size:0.88rem', 'font-weight:700', "font-family:inherit",
      'cursor:pointer',
    ].join(';');

    var footStyle = 'font-size:0.72rem;text-align:center;margin:10px 0 0;' +
      (dark ? 'color:#6b7280' : 'color:#9ca3af');

    function toggle(id, checked, disabled) {
      return '<input type="checkbox" id="' + id + '"' +
        (checked ? ' checked' : '') +
        (disabled ? ' disabled' : '') +
        ' style="width:18px;height:18px;accent-color:#e64c19;flex-shrink:0;margin-top:2px;' +
        'cursor:' + (disabled ? 'not-allowed;opacity:.4' : 'pointer') + '">';
    }

    var panel = document.createElement('div');
    panel.id = 'rr-ck-panel';
    panel.setAttribute('role', 'dialog');
    panel.setAttribute('aria-modal', 'true');
    panel.setAttribute('aria-label', 'Personnaliser les cookies');

    panel.innerHTML =
      '<div id="rr-ck-overlay" style="' + overlayStyle + '"></div>' +
      '<div role="document" style="' + boxStyle + '">' +
        '<div style="max-width:520px;margin:0 auto">' +
          '<h3 style="' + titleStyle + '">Personnaliser mes choix</h3>' +
          '<p style="' + subtitleStyle + '">Les cookies nécessaires ne peuvent pas être désactivés.</p>' +

          '<div style="' + rowStyle + '">' +
            '<label for="rr-ck-necessary" style="' + labelStyle + ';cursor:default">' +
              'Cookies nécessaires' +
              '<span style="' + descStyle + '">Authentification, panier, session. Toujours actifs.</span>' +
            '</label>' +
            toggle('rr-ck-necessary', true, true) +
          '</div>' +

          '<div style="' + rowStyle + '">' +
            '<label for="rr-ck-analytics" style="' + labelStyle + ';cursor:pointer">' +
              'Mesure d\'audience' +
              '<span style="' + descStyle + '">Comprendre comment le site est utilisé. Non activés actuellement.</span>' +
            '</label>' +
            toggle('rr-ck-analytics', !!current.analytics, false) +
          '</div>' +

          '<div style="' + rowStyle + 'border-bottom:none">' +
            '<label for="rr-ck-marketing" style="' + labelStyle + ';cursor:pointer">' +
              'Marketing' +
              '<span style="' + descStyle + '">Publicités ciblées. Non activés actuellement.</span>' +
            '</label>' +
            toggle('rr-ck-marketing', !!current.marketing, false) +
          '</div>' +

          '<button id="rr-ck-save" style="' + btnSaveStyle + '">Enregistrer mes choix</button>' +
          '<p style="' + footStyle + '">' +
            '<a href="/cookies.html" style="color:#e64c19;text-decoration:underline">Politique des cookies</a>' +
          '</p>' +
        '</div>' +
      '</div>';

    document.body.appendChild(panel);

    el('rr-ck-overlay').addEventListener('click', function () {
      panel.parentNode.removeChild(panel);
    });

    el('rr-ck-save').addEventListener('click', function () {
      writeConsent({
        analytics: el('rr-ck-analytics').checked,
        marketing: el('rr-ck-marketing').checked,
      });
      panel.parentNode.removeChild(panel);
      hideBar();
    });
  }

  /* ── Bandeau principal ────────────────────────────────── */

  function showBar() {
    if (el('rr-ck-bar')) return;

    var dark = isDark();

    var barStyle = [
      'position:fixed', 'bottom:0', 'left:0', 'right:0', 'z-index:10000',
      dark ? 'background:#1b110e;border-top:1px solid #3a2318'
           : 'background:#fff;border-top:1px solid #e8ddd8',
      'box-shadow:0 -4px 24px rgba(0,0,0,.12)',
      'padding:14px 16px',
      "font-family:'Epilogue',sans-serif",
      dark ? 'color:#d1d5db' : 'color:#374151',
      'transform:translateY(0)', 'opacity:1',
      'transition:transform .32s ease, opacity .32s ease',
    ].join(';');

    var textStyle = [
      'flex:1', 'min-width:200px', 'margin:0',
      'font-size:0.83rem', 'line-height:1.6',
    ].join(';');

    var bBase = [
      'padding:9px 15px', 'border-radius:6px',
      'font-size:0.8rem', 'font-weight:700', "font-family:inherit",
      'cursor:pointer', 'border:2px solid #e64c19', 'white-space:nowrap',
    ].join(';');

    var bAccept = bBase + ';background:#e64c19;color:#fff';
    var bRefuse = bBase + ';background:' + (dark ? 'transparent' : '#fff') + ';color:#e64c19';
    var bCustom = bBase + ';background:' + (dark ? 'transparent' : '#f8f6f6') +
      ';color:' + (dark ? '#9ca3af' : '#6b7280') +
      ';border-color:' + (dark ? '#3a2318' : '#e8ddd8');

    var bar = document.createElement('div');
    bar.id = 'rr-ck-bar';
    bar.setAttribute('role', 'region');
    bar.setAttribute('aria-label', 'Consentement aux cookies');
    bar.style.cssText = barStyle;

    bar.innerHTML =
      '<div style="max-width:900px;margin:0 auto;display:flex;flex-wrap:wrap;align-items:center;gap:10px">' +
        '<p style="' + textStyle + '">' +
          'Nous utilisons des cookies nécessaires au fonctionnement du site. Avec votre accord, ' +
          'nous pourrons aussi utiliser des cookies de mesure d\'audience pour améliorer Racines &amp; Rituels.&#32;' +
          '<a href="/cookies.html" style="color:#e64c19;font-weight:600;text-decoration:underline;white-space:nowrap">En savoir plus</a>' +
        '</p>' +
        '<div style="display:flex;flex-wrap:wrap;gap:8px;flex-shrink:0">' +
          '<button id="rr-ck-accept" style="' + bAccept + '">Accepter</button>' +
          '<button id="rr-ck-refuse" style="' + bRefuse + '">Refuser</button>' +
          '<button id="rr-ck-custom" style="' + bCustom + '">Personnaliser</button>' +
        '</div>' +
      '</div>';

    document.body.appendChild(bar);

    el('rr-ck-accept').addEventListener('click', function () {
      writeConsent({ analytics: true, marketing: false });
      hideBar();
    });

    el('rr-ck-refuse').addEventListener('click', function () {
      writeConsent({ analytics: false, marketing: false });
      hideBar();
    });

    el('rr-ck-custom').addEventListener('click', function () {
      buildPanel();
    });
  }

  /* ── API globale ──────────────────────────────────────── */

  window.RRResetCookieConsent = function () {
    try { localStorage.removeItem(KEY); } catch (e) {}
    var panel = el('rr-ck-panel');
    if (panel && panel.parentNode) panel.parentNode.removeChild(panel);
    var bar = el('rr-ck-bar');
    if (bar && bar.parentNode) bar.parentNode.removeChild(bar);
    showBar();
  };

  /* ── Init ─────────────────────────────────────────────── */

  if (!readConsent()) {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', showBar);
    } else {
      showBar();
    }
  }

}());
