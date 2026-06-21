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
- [x] `pages/confidentialite.html` — politique de confidentialité RGPD complète
  - Données collectées (identité, commandes, abonnements, technique)
  - Finalités et base légale (contrat, obligation légale, intérêt légitime, consentement)
  - Prestataires : Vercel, Supabase, Stripe, Resend, IONOS
  - Durées de conservation
  - Droits des utilisateurs (accès, rectification, effacement, opposition, limitation, portabilité, consentement, CNIL)
  - Transferts hors UE — clauses contractuelles types
  - Sécurité (HTTPS, accès restreint, secrets en variables d'environnement)
- [ ] `pages/cgv.html` — Conditions Générales de Vente
  - Objet et champ d'application
  - Prix (TTC, TVA)
  - Modalités de paiement (Stripe)
  - Délais et modes de livraison (produits physiques si applicable)
  - Rétractation (14 jours pour les produits, exception abonnements numériques)
  - Garanties légales
  - Médiation des litiges (art. L.612-1 Code de la consommation)
- [ ] `pages/cookies.html` — politique des cookies
  - Liste des cookies utilisés (techniques, analytiques, tiers)
  - Durée de conservation
  - Comment les refuser / les gérer

---

## Intégration footer

- [x] Lien "Mentions légales" ajouté dans `components/footer.html`
- [x] Lien "Confidentialité" ajouté dans `components/footer.html`
- [ ] Ajouter lien "CGV" dans le footer quand la page sera créée
- [ ] Ajouter lien "Cookies" dans le footer quand la page sera créée

---

## Obligations légales en production

- [ ] **Bandeau cookies** conforme ePrivacy (consentement avant tout cookie non essentiel / analytics)
- [ ] Vérifier que les emails transactionnels contiennent le droit de contact / désabonnement marketing
- [ ] Documenter un registre interne des traitements (recommandé, pas obligatoire pour les TPE)
- [ ] Souscrire une RC Pro si vente de produits physiques / conseils santé
- [ ] Vérifier l'habilitation pour la vente de produits liés au bien-être / plantes médicinales
- [ ] Conditions générales d'abonnement : préciser la politique de résiliation et de remboursement
- [ ] Droit de rétractation : vérifier l'exception pour les biens numériques / abonnements (art. L.221-28 Code de la consommation)

---

## Liens en attente (404 temporaires)

Ces liens existent dans les pages légales mais renvoient 404 jusqu'à la création des pages cibles :
- `/cookies.html` — référencé dans `mentions-legales.html` et `confidentialite.html`
- `/cgv.html` — pas encore référencé dans le footer

---

## Notes

- Le domaine `racinesetrituels.com` est référencé dans les canonical URLs. Vérifier la configuration Vercel avant mise en production.
- La page `confidentialite.html` mentionne Stripe, Resend, Vercel, Supabase, IONOS comme prestataires. À mettre à jour si la liste évolue.
- Délai de réponse aux droits RGPD mentionné dans la page : **30 jours**.
