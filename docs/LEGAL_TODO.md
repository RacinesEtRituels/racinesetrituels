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

## Pages légales — toutes créées ✅

- [x] `pages/mentions-legales.html` — éditeur, hébergeur, PI, responsabilité, RGPD, cookies, contact
- [x] `pages/confidentialite.html` — politique de confidentialité RGPD (14 sections)
- [x] `pages/cgv.html` — Conditions Générales de Vente (15 sections)
- [x] `pages/cookies.html` — politique des cookies (9 sections, bouton reset consentement)
- [x] `pages/retractation-retours.html` — droit de rétractation 14 jours, conditions retour, formulaire légal copiable
- [x] `pages/mediateur-consommation.html` — procédure de médiation, lien CECMC, plateforme ODR
- [x] `pages/contact.html` — email, sujets fréquents, liens utiles

---

## Bandeau de consentement ✅

- [x] `public/js/cookie-consent.js` — bandeau RGPD autonome (accept / refuser / personnaliser)
- [x] Chargé automatiquement via `components/footer.html` → `footer-loader.js`
- [x] API `window.RRResetCookieConsent()` disponible
- [x] Bouton "Modifier mes préférences" dans `pages/cookies.html`

---

## Intégration footer ✅

- [x] Navigation principale : Accueil, Produits, Conseils, Mon compte, Contact
- [x] Liens légaux : Mentions légales, Confidentialité, CGV, Cookies, Rétractation, Médiateur

---

## ⚠ Actions manuelles restantes

### Priorité haute
- [ ] **Choisir et renseigner un médiateur de la consommation** dans `pages/mediateur-consommation.html`
  - Remplacer le bloc "À compléter" par le nom, coordonnées et URL du médiateur choisi
  - Organismes possibles : FEVAD, médiateur e-commerce, CM2C, ou autre organisme agréé CECMC
  - Liste officielle : https://www.economie.gouv.fr/mediation-conso
  - Une fois choisi, mettre à jour aussi les CGV (section 14)

### Priorité moyenne
- [ ] Confirmer les exceptions légales à la rétractation pour les produits du catalogue
  (vérifier si des produits sont descellés ou périssables et donc non éligibles)
- [ ] Renseigner l'adresse de retour physique dans `pages/retractation-retours.html`
  (à communiquer au client sur demande ou à afficher directement)
- [ ] Vérifier l'habilitation pour la vente de produits liés au bien-être / plantes médicinales
- [ ] Souscrire une RC Pro si vente de produits physiques / conseils santé

### Priorité basse
- [ ] Activer les cookies analytics si un outil est déployé (GA4, Plausible…)
  → cookie-consent.js est câblé pour gérer le consentement, brancher la librairie sur `consent.analytics`
- [ ] Documenter un registre interne des traitements RGPD
- [ ] Vérifier les emails transactionnels : mentions légales requises
- [ ] Clarifier les modalités exactes de résiliation des abonnements (délai de préavis)

---

## Notes

- `mediateur-consommation.html` contient un bloc TODO visible "À compléter" — à remplacer avant mise en production.
- La plateforme ODR européenne est référencée : `ec.europa.eu/consumers/odr`.
- Le formulaire de rétractation dans `retractation-retours.html` est copiable via un bouton JS.
- Le domaine `racinesetrituels.com` est utilisé dans tous les canonical URLs — vérifier config Vercel.
- `localStorage['rr_cookie_consent']` = `{ necessary, analytics, marketing, date }`.
