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

## Pages légales à créer

- [x] `pages/mentions-legales.html` — éditeur, hébergeur, PI, responsabilité, RGPD, cookies, contact
- [ ] `pages/confidentialite.html` — politique de confidentialité / RGPD complète
  - Données collectées (compte, commande, email)
  - Finalités et base légale
  - Durée de conservation
  - Droits des utilisateurs (accès, rectification, suppression, portabilité, opposition)
  - DPO / contact : contact@racinesetrituels.com
- [ ] `pages/cgv.html` — Conditions Générales de Vente
  - Objet et champ d'application
  - Prix (TTC, TVA)
  - Modalités de paiement (Stripe)
  - Délais et modes de livraison (produits physiques si applicable)
  - Rétractation (14 jours pour les produits, exception abonnements numériques)
  - Garanties légales
  - Médiation des litiges (art. L.612-1 Code de la consommation)
- [ ] `pages/cookies.html` — politique des cookies
  - Liste des cookies utilisés (téchniques, analytiques, tiers)
  - Durée de conservation
  - Comment les refuser

---

## Intégration footer

- [x] Lien "Mentions légales" ajouté dans `components/footer.html`
- [ ] Ajouter lien "CGV" dans le footer quand la page sera créée
- [ ] Ajouter lien "Confidentialité" dans le footer quand la page sera créée

---

## Obligations légales en production

- [ ] Bannière cookies conforme ePrivacy (consentement avant analytics/tracking)
- [ ] Vérifier que les emails transactionnels mentionnent le droit de désabonnement
- [ ] Déclarer les traitements de données si nécessaire (pas d'obligation RGPD d'enregistrement pour les TPE, mais documenter un registre interne)
- [ ] Souscrire une RC Pro si vente de produits physiques / conseils santé
- [ ] Vérifier l'habilitation pour la vente de produits liés au bien-être / plantes

---

## Mentions légales — lien dans les pages importantes

Pages qui devraient avoir un accès rapide aux mentions légales (via footer) :
- Toutes les pages → footer global ✅ (lien ajouté)
- Page checkout : vérifier que le footer est visible avant paiement
- Page success/panier : idem

---

## Notes

- La page `mentions-legales.html` contient des liens vers `confidentialite.html` et `cookies.html` qui n'existent pas encore. Ces liens sont en attente (404 jusqu'à création des pages).
- Le domaine `racinesetrituels.com` est référencé dans les canonical URLs. Vérifier que le domaine est bien configuré sur Vercel avant mise en production.
