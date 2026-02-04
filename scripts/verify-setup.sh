#!/usr/bin/env bash
# Script de vérification rapide du workflow de dev

set -e

echo "╔═══════════════════════════════════════════════════════════╗"
echo "║  🧪 VÉRIFICATION DU WORKFLOW RACINES & RITUELS           ║"
echo "╚═══════════════════════════════════════════════════════════╝"
echo ""

# 1. Vérifier que les scripts existent et sont exécutables
echo "1️⃣  Vérification des scripts..."
for script in scripts/dev-preflight.sh scripts/dev-stripe.sh scripts/dev-summary.sh; do
  if [ -x "$script" ]; then
    echo "   ✅ $script"
  else
    echo "   ❌ $script manquant ou non exécutable"
    exit 1
  fi
done

# 2. Vérifier package.json
echo ""
echo "2️⃣  Vérification package.json..."
if grep -q '"dev": "npm run dev:pre && npm run dev:services"' package.json; then
  echo "   ✅ Scripts npm configurés"
else
  echo "   ❌ Scripts npm manquants"
  exit 1
fi

# 3. Vérifier dépendances
echo ""
echo "3️⃣  Vérification des dépendances..."
if [ -d "node_modules/concurrently" ] && [ -d "node_modules/http-server" ]; then
  echo "   ✅ concurrently installé"
  echo "   ✅ http-server installé"
else
  echo "   ⚠️  Dépendances manquantes - lance: npm install"
  exit 1
fi

# 4. Vérifier prérequis système
echo ""
echo "4️⃣  Vérification des prérequis système..."

if command -v docker &> /dev/null; then
  echo "   ✅ Docker CLI installé"
  if docker info >/dev/null 2>&1; then
    echo "   ✅ Docker Desktop actif"
  else
    echo "   ⚠️  Docker Desktop non démarré"
  fi
else
  echo "   ❌ Docker non installé"
fi

if command -v supabase &> /dev/null; then
  echo "   ✅ Supabase CLI installé ($(supabase --version))"
else
  echo "   ⚠️  Supabase CLI manquant - lance: brew install supabase/tap/supabase"
fi

if command -v stripe &> /dev/null; then
  echo "   ✅ Stripe CLI installé (optionnel)"
else
  echo "   ℹ️  Stripe CLI absent (optionnel pour webhooks)"
fi

# 5. Vérifier config backend
echo ""
echo "5️⃣  Vérification configuration backend..."
if [ -f "server/.env" ]; then
  echo "   ✅ server/.env existe"
  if grep -q "STRIPE_SECRET_KEY" server/.env && grep -q "SUPABASE_URL" server/.env; then
    echo "   ✅ Variables clés présentes"
  else
    echo "   ⚠️  Variables manquantes dans server/.env"
  fi
else
  echo "   ❌ server/.env manquant"
fi

echo ""
echo "╔═══════════════════════════════════════════════════════════╗"
echo "║  ✅ VÉRIFICATION TERMINÉE                                ║"
echo "╚═══════════════════════════════════════════════════════════╝"
echo ""
echo "🚀 Prêt! Lance le workflow avec:"
echo "   npm run dev"
echo ""
