# 🌿 QUICKSTART - Racines & Rituels

## 🚀 Démarrage rapide (commande unique)

```bash
npm run dev
```

**Ce que ça fait:**

1. ✅ Kill automatique des ports 3000 & 8000
2. ✅ Vérification Docker (erreur claire si non démarré)
3. ✅ Démarrage Supabase local (idempotent)
4. ✅ Backend Express → http://localhost:3000
5. ✅ Frontend static → http://localhost:8000
6. ✅ Stripe webhooks (optionnel, ne bloque pas)
7. ✅ Résumé avec URLs et commandes de test

**Arrêter:** `Ctrl+C` (tue tous les services)

---

## 🌐 URLs des services

| Service            | URL                          |
| ------------------ | ---------------------------- |
| 🌐 Frontend        | http://localhost:8000        |
| 🔌 Backend API     | http://localhost:3000        |
| 📊 Health Check    | http://localhost:3000/health |
| 🗄️ Supabase Studio | http://127.0.0.1:54323       |
| 💾 Supabase API    | http://127.0.0.1:54321       |

---

## 🧪 Tests rapides

### 1. Health check backend

```bash
curl http://localhost:3000/health
```

### 2. Test checkout automatique (produit réel depuis DB)

```bash
npm run test:checkout
```

### 3. Checkout manuel

```bash
curl -X POST http://localhost:3000/create-checkout-session \
  -H "Content-Type: application/json" \
  -d '{"items":[{"product_id":"<PRODUCT_ID>","quantity":1}]}'
```

⚠️ **Ne hardcode jamais un product_id!** Utilise `npm run test:checkout` qui récupère un produit réel.

---

## 📜 Commandes utiles

```bash
npm run dev           # Lance tout le stack
npm run test:checkout # Test checkout avec produit réel
npm run db:status     # Statut Supabase (ports, credentials)
npm run db:reset      # ⚠️ Reset DB + applique migrations
npm run stop          # Arrête Supabase uniquement
npm run kill:ports    # Libère ports 3000/8000 manuellement
```

---

## 🛠️ Troubleshooting

### Port déjà occupé

```bash
npm run dev  # Kill automatique
```

### Docker non démarré

1. Lance Docker Desktop
2. Attends que l'icône Docker soit stable
3. Relance `npm run dev`

### Supabase ne démarre pas

```bash
npm run stop
npm run dev
```

### Logs détaillés

```bash
tail -f logs/backend.log
tail -f logs/frontend.log
tail -f logs/stripe.log
```

---

## ✅ Idempotence garantie

- ✓ Relancer `npm run dev` plusieurs fois ne plante jamais
- ✓ Ports occupés → libérés automatiquement
- ✓ Supabase déjà démarré → réutilisé (pas de restart)
- ✓ Stripe CLI absent → warning, le dev continue

---

## 📚 Documentation complète

- **TEST_FINAL.md** - Procédure de test étape par étape
- **WORKFLOW.md** - Documentation complète du workflow
- **SETUP.md** - Installation et troubleshooting détaillés

📜 COMMANDES UTILES
────────────────────────────────────────────────────────────────────────────
npm run dev Lance tout le stack
npm run stop Arrête Supabase
npm run db:reset Reset DB + migrations
npm run kill:ports Libère ports 3000/8000
bash scripts/verify-setup.sh Vérification complète

🛠️ TROUBLESHOOTING
────────────────────────────────────────────────────────────────────────────
Port occupé → npm run dev (kill auto)
Docker non démarré → Lance Docker Desktop puis npm run dev
Supabase ne démarre → npm run stop && npm run dev
Stripe manquant → brew install stripe/stripe-cli/stripe (optionnel)

📂 FICHIERS CRÉÉS/MODIFIÉS
────────────────────────────────────────────────────────────────────────────
✨ scripts/dev-preflight.sh - Preflight (kill, docker, supabase)
✨ scripts/dev-stripe.sh - Wrapper Stripe CLI
✨ scripts/dev-summary.sh - Affichage résumé
✨ scripts/verify-setup.sh - Vérification installation
✨ WORKFLOW.md - Documentation complète
✨ SETUP.md - Guide installation détaillé
✏️ package.json - Nouveaux scripts npm
✏️ server/server.js - Erreurs Supabase détaillées (DEV)
✨ supabase/migrations/20251223_add_user_id.sql

✅ IDEMPOTENT
────────────────────────────────────────────────────────────────────────────
✓ Relancer npm run dev plusieurs fois ne plante jamais
✓ Ports occupés → libérés automatiquement
✓ Supabase déjà démarré → réutilisé (pas de restart)
✓ Docker non démarré → message clair + arrêt propre

📚 DOCUMENTATION
────────────────────────────────────────────────────────────────────────────
Ce fichier QUICKSTART.md - Commandes rapides
Documentation WORKFLOW.md - Guide complet
Installation SETUP.md - Guide d'installation

╔═══════════════════════════════════════════════════════════════════════════╗
║ 🎉 PRÊT! Lance: npm run dev ║
╚═══════════════════════════════════════════════════════════════════════════╝
