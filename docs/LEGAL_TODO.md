# Checklist légale — Racines & Rituels

## Informations de référence

| Champ | Valeur |
|---|---|
| Éditeur | Alexandre BOEHLER |
| Forme juridique | Entrepreneur individuel / micro-entreprise |
| SIREN | 484 314 174 |
| RCS | 484 314 174 R.C.S. Vienne |
| Adresse | 24 Rue Gilbert Ollier, Bât A les Bleuets — 38780 Pont-Évêque |
| Email | contact@racinesetrituels.com |
| Directeur de publication | Alexandre BOEHLER |
| Hébergeur | Vercel Inc. — 440 N Barranca Ave #4133, Covina, CA 91723, USA |
| Domaine | racinesetrituels.com |

---

## Pages légales

- [x] `pages/mentions-legales.html` — éditeur, hébergeur, PI, responsabilité, RGPD, cookies, contact
- [x] `pages/confidentialite.html` — politique de confidentialité RGPD (14 sections)
- [x] `pages/cgv.html` — Conditions Générales de Vente (15 sections, dont section Contact)
- [x] `pages/cookies.html` — politique des cookies (9 sections, bouton reset consentement)
- [ ] `pages/retractation.html` *(optionnel)* — formulaire de rétractation dédié
- [ ] `pages/contact.html` *(optionnel)* — page contact dédiée

---

## Intégration footer

- [x] Lien "Mentions légales" dans `components/footer.html`
- [x] Lien "Confidentialité" dans `components/footer.html`
- [x] Lien "CGV" dans `components/footer.html`
- [x] Lien "Cookies" dans `components/footer.html`
- [x] Script `cookie-consent.js` chargé via `components/footer.html` (toutes les pages)

---

## Bandeau de consentement

- [x] `public/js/cookie-consent.js` — bandeau RGPD autonome
  - Chargé automatiquement sur toutes les pages via `footer-loader.js`
  - Boutons : Accepter / Refuser / Personnaliser
  - Panel personnalisation : nécessaires (fixe) + audience (optionnel) + marketing (optionnel, désactivé)
  - Stockage : `localStorage['rr_cookie_consent']` = `{ necessary, analytics, marketing, date }`
  - API globale : `window.RRResetCookieConsent()` — réaffiche le bandeau
  - Guard `__RR_COOKIE_LOADED__` — protège contre le double chargement
  - Dark mode natif, responsive, accessible (role region/dialog/aria-modal)
- [x] Bouton "Modifier mes préférences" dans `pages/cookies.html` (appelle `RRResetCookieConsent`)

---

## Obligations restantes

- [ ] Activer les cookies analytics uniquement si un outil est déployé (GA4, Plausible, etc.)
  — cookie-consent.js est déjà câblé pour gérer le consentement analytics
- [ ] Confirmer les exceptions légales applicables à la rétractation (produits du catalogue)
- [ ] Renseigner l'identité du médiateur de la consommation compétent dans les CGV
- [ ] Vérifier les emails transactionnels : mentions légales, droit de contact
- [ ] Souscrire une RC Pro si vente de produits physiques / conseils santé
- [ ] Vérifier l'habilitation pour la vente de produits liés au bien-être / plantes médicinales
- [ ] Clarifier les modalités de résiliation d'abonnement (délai de préavis exact)

---

## Notes

- `cookie-consent.js` ne charge aucun script analytics ou marketing — uniquement le consentement est géré.
  Il suffit de brancher les vraies librairies sur les flags `consent.analytics` / `consent.marketing`.
- Le domaine `racinesetrituels.com` est utilisé dans tous les canonical URLs — vérifier la config Vercel.
- Les cookies `rr_cookie_consent` sont stockés en `localStorage` (pas en cookie HTTP), ce qui suffit
  pour mémoriser le choix mais ne permet pas un accès côté serveur. Acceptable pour ce cas d'usage.
- Délai de réponse aux droits RGPD mentionné dans `confidentialite.html` : **30 jours**.
