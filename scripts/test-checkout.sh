#!/usr/bin/env bash
set -e

echo "╔═══════════════════════════════════════════════════════════╗"
echo "║  🧪 TEST CHECKOUT - Racines & Rituels                   ║"
echo "╚═══════════════════════════════════════════════════════════╝"
echo ""

# ============================================
# 1) Vérifier que le backend répond
# ============================================
echo "1️⃣  Vérification backend..."

if ! curl -s --max-time 3 http://localhost:3000/health >/dev/null 2>&1; then
  echo "   ❌ Backend KO - Le serveur ne répond pas sur http://localhost:3000/health"
  echo "   → Lance d'abord: npm run dev"
  exit 1
fi

echo "   ✅ Backend opérationnel"
echo ""

# ============================================
# 2) Récupérer un produit depuis Supabase
# ============================================
echo "2️⃣  Récupération d'un produit depuis Supabase..."

SUPABASE_URL="http://127.0.0.1:54321"
SUPABASE_KEY="sb_publishable_xxx"

PRODUCT_JSON=$(curl -s \
  "${SUPABASE_URL}/rest/v1/products?select=id,name,price_cents&limit=1" \
  -H "apikey: ${SUPABASE_KEY}" \
  -H "Authorization: Bearer ${SUPABASE_KEY}" \
  2>/dev/null)

# Parser avec jq si disponible, sinon fallback Node
if command -v jq &> /dev/null; then
  PRODUCT_ID=$(echo "$PRODUCT_JSON" | jq -r '.[0].id // empty')
  PRODUCT_NAME=$(echo "$PRODUCT_JSON" | jq -r '.[0].name // empty')
  PRODUCT_PRICE=$(echo "$PRODUCT_JSON" | jq -r '.[0].price_cents // empty')
else
  # Fallback Node.js one-liner
  PRODUCT_ID=$(node -e "const d=JSON.parse('$PRODUCT_JSON'); console.log(d[0]?.id || '')" 2>/dev/null || echo "")
  PRODUCT_NAME=$(node -e "const d=JSON.parse('$PRODUCT_JSON'); console.log(d[0]?.name || '')" 2>/dev/null || echo "")
  PRODUCT_PRICE=$(node -e "const d=JSON.parse('$PRODUCT_JSON'); console.log(d[0]?.price_cents || '')" 2>/dev/null || echo "")
fi

if [ -z "$PRODUCT_ID" ]; then
  echo "   ❌ Aucun produit trouvé dans Supabase"
  echo "   → Vérifie que Supabase est démarré: npm run status"
  echo "   → Ou reset la DB: npm run db:reset"
  exit 1
fi

echo "   ✅ Produit trouvé:"
echo "      ID:    ${PRODUCT_ID}"
echo "      Nom:   ${PRODUCT_NAME}"
echo "      Prix:  ${PRODUCT_PRICE} centimes"
echo ""

# ============================================
# 3) Tester le checkout avec ce produit
# ============================================
echo "3️⃣  Test création de checkout session..."

CHECKOUT_RESPONSE=$(curl -s -w "\n%{http_code}" -X POST http://localhost:3000/create-checkout-session \
  -H "Content-Type: application/json" \
  -d "{\"items\":[{\"product_id\":\"${PRODUCT_ID}\",\"quantity\":1}]}")

HTTP_CODE=$(echo "$CHECKOUT_RESPONSE" | tail -n1)
RESPONSE_BODY=$(echo "$CHECKOUT_RESPONSE" | sed '$d')

echo "   📊 Code HTTP: ${HTTP_CODE}"
echo ""

if [ "$HTTP_CODE" = "200" ]; then
  echo "   ✅ SUCCÈS - Checkout session créée!"
  echo ""
  echo "   Réponse:"
  
  # Afficher avec formatage si jq est disponible
  if command -v jq &> /dev/null; then
    echo "$RESPONSE_BODY" | jq '.'
  else
    echo "$RESPONSE_BODY"
  fi
  
  # Extraire l'URL Stripe
  if command -v jq &> /dev/null; then
    CHECKOUT_URL=$(echo "$RESPONSE_BODY" | jq -r '.url // empty')
    if [ -n "$CHECKOUT_URL" ]; then
      echo ""
      echo "   🔗 URL de checkout Stripe:"
      echo "      ${CHECKOUT_URL}"
    fi
  fi
  
  echo ""
  echo "╔═══════════════════════════════════════════════════════════╗"
  echo "║  ✅ TEST RÉUSSI                                          ║"
  echo "╚═══════════════════════════════════════════════════════════╝"
  exit 0
else
  echo "   ❌ ÉCHEC - Code HTTP: ${HTTP_CODE}"
  echo ""
  echo "   Réponse d'erreur:"
  
  if command -v jq &> /dev/null; then
    echo "$RESPONSE_BODY" | jq '.'
  else
    echo "$RESPONSE_BODY"
  fi
  
  echo ""
  echo "╔═══════════════════════════════════════════════════════════╗"
  echo "║  ❌ TEST ÉCHOUÉ                                          ║"
  echo "╚═══════════════════════════════════════════════════════════╝"
  exit 1
fi
