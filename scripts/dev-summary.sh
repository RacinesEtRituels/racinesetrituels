#!/usr/bin/env bash

BACKEND_PORT="${PORT:-3000}"
BACKEND_URL="http://localhost:${BACKEND_PORT}"

# Attendre que tous les services soient prêts
sleep 3

# Récupérer un product_id d'exemple depuis Supabase
PRODUCT_ID=$(curl -s "http://127.0.0.1:54321/rest/v1/products?select=id&limit=1" \
  -H "apikey: sb_publishable_ACJWlzQHlZjBrEguHvfOxg_3BJgxAaH" \
  -H "Authorization: Bearer sb_publishable_ACJWlzQHlZjBrEguHvfOxg_3BJgxAaH" \
  2>/dev/null | grep -o '"id":"[^"]*"' | head -n 1 | cut -d'"' -f4)

if [ -z "$PRODUCT_ID" ]; then
  PRODUCT_ID="<product_id_from_db>"
fi

cat << EOF

╔══════════════════════════════════════════════════════════════════════╗
║                  🌿 RACINES & RITUELS - DEV MODE                    ║
╚══════════════════════════════════════════════════════════════════════╝

📦 SERVICES DÉMARRÉS:
────────────────────────────────────────────────────────────────────────
  🌐 Frontend (static)  → http://localhost:8000
  🔌 Backend API        → ${BACKEND_URL}
  📊 Backend Health     → ${BACKEND_URL}/health
  🗄️  Supabase Studio   → http://127.0.0.1:54323
  💾 Supabase API       → http://127.0.0.1:54321
  💳 Stripe Webhooks    → stripe listen --forward-to localhost:${BACKEND_PORT}/webhook/stripe

────────────────────────────────────────────────────────────────────────
🧪 TESTS RAPIDES:
────────────────────────────────────────────────────────────────────────

1️⃣  Health check backend:
  curl ${BACKEND_URL}/health

2️⃣  Créer une session de checkout Stripe:
   curl -X POST ${BACKEND_URL}/create-checkout-session \
     -H "Content-Type: application/json" \\
     -d '{"items":[{"product_id":"$PRODUCT_ID","quantity":1}]}'

3️⃣  Lister les produits (Supabase):
   curl "http://127.0.0.1:54321/rest/v1/products?select=*" \\
     -H "apikey: sb_publishable_ACJWlzQHlZjBrEguHvfOxg_3BJgxAaH"

────────────────────────────────────────────────────────────────────────
💡 COMMANDES UTILES:
────────────────────────────────────────────────────────────────────────
  npm run dev         → Démarre tout le stack
  npm run stop        → Arrête Supabase
  npm run db:reset    → Reset la DB locale
  npm run status      → Statut Supabase

────────────────────────────────────────────────────────────────────────
⌨️  Ctrl+C pour arrêter tous les services
────────────────────────────────────────────────────────────────────────

EOF

# Garder le processus actif pour que concurrently ne tue pas les autres
echo "👀 Surveillance des services... (Ctrl+C pour arrêter)"
tail -f /dev/null
