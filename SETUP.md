# 🎯 INSTALLATION & SETUP - Workflow Dev Ultra-Carré

## 📦 Ce qui a été créé

### ✅ Fichiers ajoutés/modifiés

```
racinesetrituels/
├── package.json                  # ✏️ MODIFIÉ - Nouveaux scripts npm
├── WORKFLOW.md                   # ✨ NOUVEAU - Documentation complète
├── scripts/
│   ├── dev-preflight.sh         # ✨ NOUVEAU - Kill ports + check Docker + start Supabase
│   ├── dev-stripe.sh            # ✨ NOUVEAU - Wrapper Stripe CLI
│   ├── dev-summary.sh           # ✨ NOUVEAU - Affichage URLs/tests
│   └── verify-setup.sh          # ✨ NOUVEAU - Vérification installation
└── supabase/
    └── migrations/
        └── 20251223_add_user_id.sql  # ✨ NOUVEAU - Colonne user_id pour orders
```

---

## 🚀 INSTALLATION (première fois)

### 1. Installer les dépendances npm

```bash
cd "/Users/alexandreboehler/Documents/racines&rituels site/racinesetrituels"
npm install
```

Cela installe:

- `concurrently` (déjà présent, vérifié)
- `http-server` (nouveau, pour servir le frontend)

### 2. Vérifier l'installation

```bash
bash scripts/verify-setup.sh
```

Devrait afficher tous les ✅. Si ⚠️ ou ❌:

- Docker: Lance Docker Desktop
- Supabase CLI manquant: `brew install supabase/tap/supabase`
- Stripe CLI (optionnel): `brew install stripe/stripe-cli/stripe`

### 3. Test initial

```bash
npm run dev
```

Devrait afficher:

```
🔧 [PREFLIGHT] Préparation de l'environnement...
   ✅ Port 3000 libéré
   ✅ Port 8000 libéré
   ✅ Docker opérationnel
   ✅ Supabase démarré

╔═══════════════════════════════════════════════════╗
║     🌿 RACINES & RITUELS - DEV MODE              ║
╚═══════════════════════════════════════════════════╝

📦 SERVICES DÉMARRÉS:
  🌐 Frontend  → http://localhost:8000
  🔌 Backend   → http://localhost:3000
  🗄️ Supabase  → http://127.0.0.1:54323
  ...
```

**Ctrl+C pour arrêter tous les services**

---

## 🎯 UTILISATION QUOTIDIENNE

### Démarrer le stack complet

```bash
npm run dev
```

Un seul terminal, tous les services démarrent dans l'ordre:

1. Kill des ports 3000/8000 si occupés
2. Check Docker (arrêt si non démarré)
3. Start Supabase local (idempotent)
4. Backend Express (port 3000)
5. Frontend static (port 8000)
6. Stripe webhooks (si CLI présent)

### Arrêter tous les services

Dans le terminal `npm run dev`:

```bash
Ctrl+C
```

Tous les processus (backend, frontend, Stripe) sont tués automatiquement.

Pour arrêter uniquement Supabase:

```bash
npm run stop
```

---

## 🧪 VÉRIFICATION RAPIDE

### Tests manuels (copier/coller après `npm run dev`)

```bash
# 1. Health check backend
curl http://localhost:3000/health

# 2. Frontend accessible
open http://localhost:8000

# 3. Supabase Studio
open http://127.0.0.1:54323

# 4. Checkout session Stripe (remplace <product_id>)
curl -X POST http://localhost:3000/create-checkout-session \
  -H "Content-Type: application/json" \
  -d '{"items":[{"product_id":"dc6f14a7-9656-4580-996e-90d346eb0aeb","quantity":1}]}'
```

### Script de vérification automatique

```bash
bash scripts/verify-setup.sh
```

---

## 📜 SCRIPTS NPM DISPONIBLES

| Commande               | Description                                                     |
| ---------------------- | --------------------------------------------------------------- |
| `npm run dev`          | **Lance tout** (preflight + tous les services)                  |
| `npm run dev:pre`      | Preflight uniquement (kill ports, check docker, start supabase) |
| `npm run dev:server`   | Backend Express uniquement (port 3000)                          |
| `npm run dev:front`    | Frontend static uniquement (port 8000)                          |
| `npm run dev:stripe`   | Stripe webhooks uniquement                                      |
| `npm run kill:ports`   | Libère ports 3000 et 8000                                       |
| `npm run check:docker` | Vérifie Docker actif                                            |
| `npm run stop`         | Arrête Supabase local                                           |
| `npm run status`       | Statut Supabase (ports, credentials)                            |
| `npm run db:reset`     | Reset DB + applique migrations                                  |

---

## 🔧 TROUBLESHOOTING

### Problème: "Port 3000 déjà utilisé"

**Solution automatique:** `npm run dev` tue automatiquement les ports
**Solution manuelle:**

```bash
npm run kill:ports
npm run dev
```

### Problème: "Docker n'est pas en cours d'exécution"

**Solution:**

1. Lance Docker Desktop (icône baleine dans la barre macOS)
2. Attends que Docker soit prêt (icône stable)
3. Relance `npm run dev`

### Problème: "Supabase ne démarre pas"

```bash
# Stop complet
npm run stop

# Relance
npm run dev
```

Si ça ne marche pas:

```bash
# Reset complet Supabase
supabase stop
supabase start
```

### Problème: "Stripe webhooks ne marchent pas"

**Optionnel** - Le dev fonctionne sans webhooks Stripe locaux

Pour l'activer:

```bash
# Installe Stripe CLI
brew install stripe/stripe-cli/stripe

# Login
stripe login

# Relance
npm run dev
```

### Problème: "Backend erreur db_write_failed"

Vérifie que les migrations sont appliquées:

```bash
npm run db:reset
```

Vérifie les erreurs détaillées dans les logs backend (NODE_ENV=development)

---

## ✅ VÉRIFICATION POST-INSTALLATION

### Checklist

- [ ] `npm install` sans erreurs
- [ ] `bash scripts/verify-setup.sh` → tous ✅
- [ ] Docker Desktop démarré
- [ ] `npm run dev` → tous les services démarrent
- [ ] `curl http://localhost:3000/health` → `{"ok":true}`
- [ ] `open http://localhost:8000` → site accessible
- [ ] Ctrl+C → tous les services s'arrêtent

---

## 📝 NOTES IMPORTANTES

### Idempotence ✅

- Relancer `npm run dev` plusieurs fois ne plante jamais
- Ports occupés → automatiquement libérés
- Supabase déjà démarré → réutilisé (pas de restart inutile)

### Ordre d'exécution garanti

1. **Preflight séquentiel** (kill ports, docker, supabase)
2. **Services concurrents** (backend, frontend, stripe, summary)

### macOS uniquement

Scripts bash adaptés pour macOS/zsh:

- `lsof` pour kill ports
- `docker info` pour check Docker
- Chemins avec espaces gérés

### Logs colorés

- 🔵 BACKEND (bleu)
- 🟢 FRONTEND (vert)
- 🟣 STRIPE (magenta)
- 🔷 SUMMARY (cyan)

---

## 🎉 RÉSUMÉ

**AVANT (workflow manuel):**

```bash
# Terminal 1
cd server && node server.js

# Terminal 2
python3 -m http.server 8000

# Terminal 3
supabase start

# Terminal 4
stripe listen --forward-to ...
```

**APRÈS (workflow ultra-carré):**

```bash
npm run dev
```

**Un seul terminal, tout démarre dans l'ordre, tout s'arrête proprement avec Ctrl+C**

---

## 🆘 BESOIN D'AIDE?

1. Vérification: `bash scripts/verify-setup.sh`
2. Documentation: `cat WORKFLOW.md`
3. Logs détaillés: Visible dans le terminal `npm run dev`
4. Reset complet: `npm run stop && npm run dev`

---

**Prêt!** Lance `npm run dev` et c'est parti 🚀
