# 🌿 Workflow de Développement - Racines & Rituels

## 🚀 Démarrage rapide

```bash
# 1. Installer les dépendances (première fois uniquement)
npm install

# 2. Lancer tout le stack de développement
npm run dev
```

C'est tout! Un seul commande lance:

- ✅ Supabase local (PostgreSQL + Studio)
- ✅ Backend Node/Express (port 3000)
- ✅ Frontend static (port 8000)
- ✅ Stripe CLI webhooks

## 📋 Prérequis

### Obligatoires

- **Docker Desktop** - Doit être démarré avant `npm run dev`
- **Node.js** ≥ 16
- **Supabase CLI** - Installé automatiquement ou via `brew install supabase/tap/supabase`

### Optionnels

- **Stripe CLI** - Pour les webhooks locaux: `brew install stripe/stripe-cli/stripe`
  - Si absent, le dev continue sans webhooks (message affiché)

## 🎯 Ce que fait `npm run dev`

### Phase 1: Preflight (automatique)

1. **Kill ports** - Libère les ports 3000 et 8000 si occupés
2. **Check Docker** - Vérifie que Docker tourne (sinon erreur claire)
3. **Start Supabase** - Démarre Supabase local si pas déjà actif

### Phase 2: Services (concurrents)

4. **Backend** - Express API sur http://localhost:3000
5. **Frontend** - Serveur statique sur http://localhost:8000
6. **Stripe** - Écoute webhooks (si CLI présent)
7. **Summary** - Affiche URLs et commandes de test

## 🌐 URLs des services

| Service            | URL                          | Description           |
| ------------------ | ---------------------------- | --------------------- |
| 🌐 Frontend        | http://localhost:8000        | Site statique HTML/JS |
| 🔌 Backend API     | http://localhost:3000        | Express REST API      |
| 📊 Health Check    | http://localhost:3000/health | Status backend        |
| 🗄️ Supabase Studio | http://127.0.0.1:54323       | Interface admin DB    |
| 💾 Supabase API    | http://127.0.0.1:54321       | REST/GraphQL DB       |

## 🧪 Tests rapides

### 1️⃣ Health check backend

```bash
curl http://localhost:3000/health
```

### 2️⃣ Créer une session de checkout Stripe

```bash
curl -X POST http://localhost:3000/create-checkout-session \
  -H "Content-Type: application/json" \
  -d '{"items":[{"product_id":"<product_id>","quantity":1}]}'
```

### 3️⃣ Lister les produits (Supabase direct)

```bash
curl "http://127.0.0.1:54321/rest/v1/products?select=*" \
  -H "apikey: sb_publishable_ACJWlzQHlZjBrEguHvfOxg_3BJgxAaH"
```

## 📜 Commandes disponibles

```bash
npm run dev          # Lance tout le stack (preflight + services)
npm run dev:pre      # Uniquement preflight (kill ports, check docker, start supabase)
npm run dev:server   # Backend uniquement
npm run dev:front    # Frontend uniquement
npm run dev:stripe   # Stripe webhooks uniquement
npm run stripe:listen# Stripe CLI direct -> http://localhost:3000/webhook (dev)

# Dev flow complet: npm run dev:server + npm run stripe:listen + checkout réel
# Fast UI dev: POST /debug/force-mark-paid avec X-Dev-Secret (NODE_ENV=development)
# Exemple: curl -X POST http://localhost:3000/debug/force-mark-paid -H "X-Dev-Secret: $DEV_FORCE_SECRET" -H "Content-Type: application/json" -d '{"stripe_session_id":"cs_test_..."}'
# Vérifier: curl -s "http://localhost:3000/public/order-by-session?session_id=cs_test_..." | jq .
# DB check: psql ... -c "select stripe_session_id,status,paid_at,customer_email from orders order by created_at desc limit 3;"

npm run kill:ports   # Libère ports 3000 et 8000
npm run check:docker # Vérifie que Docker tourne

npm run stop         # Arrête Supabase local
npm run status       # Statut Supabase (ports, credentials)
npm run db:reset     # Reset DB + applique migrations
npm run db:diff      # Génère diff SQL des changements
npm run db:push      # Push le schéma local vers remote
```

## 🛠️ Troubleshooting

### "Docker n'est pas en cours d'exécution"

```bash
# Solution: Lance Docker Desktop puis relance
npm run dev
```

### "Port 3000 ou 8000 déjà utilisé"

```bash
# Libère les ports manuellement
npm run kill:ports

# Puis relance
npm run dev
```

### "Supabase ne démarre pas"

```bash
# Vérifie Docker
docker ps

# Stop/restart Supabase
npm run stop
npm run dev
```

### "Stripe webhooks ne marchent pas"

```bash
# Installe Stripe CLI (optionnel)
brew install stripe/stripe-cli/stripe

# Login Stripe
stripe login

# Relance
npm run dev
```

## 📂 Structure du projet

```
racinesetrituels/
├── server/              # Backend Express
│   ├── server.js        # Point d'entrée API
│   ├── .env             # Config (Stripe, Supabase)
│   └── package.json
├── supabase/            # DB locale
│   └── migrations/      # Migrations SQL versionnées
├── scripts/             # Scripts de dev
│   ├── dev-preflight.sh # Preflight (kill, docker, supabase)
│   ├── dev-stripe.sh    # Stripe CLI wrapper
│   └── dev-summary.sh   # Affichage URLs/tests
├── js/                  # Frontend JS
├── components/          # Composants HTML
└── *.html               # Pages frontend
```

## 🔐 Configuration

### Backend (.env dans server/)

```env
STRIPE_SECRET_KEY=sk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...
SUPABASE_URL=http://127.0.0.1:54321
SUPABASE_SERVICE_ROLE_KEY=...
SITE_URL=http://localhost:8000
PORT=3000
```

### Supabase local

- URL: http://127.0.0.1:54321
- Studio: http://127.0.0.1:54323
- DB: postgresql://postgres:postgres@127.0.0.1:54322/postgres

Les credentials sont affichés par `npm run status`

## 🎨 Idempotence

Le workflow est **100% idempotent**:

- ✅ Relancer `npm run dev` plusieurs fois ne plante jamais
- ✅ Ports occupés → automatiquement libérés
- ✅ Supabase déjà démarré → réutilisé (pas de restart)
- ✅ Docker non démarré → message clair + stop propre

## 🚨 Arrêt des services

```bash
# Ctrl+C dans le terminal npm run dev
# Tue TOUS les services (backend, frontend, stripe)

# Ou manuellement
npm run stop  # Arrête uniquement Supabase
```

## 📝 Notes

- **macOS/zsh uniquement** (scripts bash adaptés)
- Logs colorés via `concurrently` pour suivre chaque service
- Le script summary reste actif → surveille les services
- Stripe CLI optionnel → dev continue si absent

---

**Besoin d'aide?** Consulte les logs de chaque service dans le terminal `npm run dev`
