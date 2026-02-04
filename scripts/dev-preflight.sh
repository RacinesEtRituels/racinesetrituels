#!/usr/bin/env bash
set -e

echo "🔧 [PREFLIGHT] Préparation de l'environnement de développement..."

# ============================================
# 1) KILL PORTS 3000 et 8000 (macOS)
# ============================================
echo "🧹 [PREFLIGHT] Nettoyage des ports 3000 et 8000..."

kill_port() {
  local port=$1
  local pids=$(lsof -ti :$port 2>/dev/null || true)
  if [ -n "$pids" ]; then
    echo "   ⚠️  Port $port occupé par PID(s): $pids"
    kill -9 $pids 2>/dev/null || true
    sleep 0.5
    echo "   ✅ Port $port libéré"
  else
    echo "   ✓ Port $port déjà libre"
  fi
}

kill_port 3000
kill_port 8000

# ============================================
# 2) CHECK DOCKER
# ============================================
echo "🐳 [PREFLIGHT] Vérification de Docker..."

if ! docker info >/dev/null 2>&1; then
  echo ""
  echo "❌ Docker n'est pas en cours d'exécution!"
  echo "   → Lance Docker Desktop puis relance 'npm run dev'"
  echo ""
  exit 1
fi

echo "   ✅ Docker est opérationnel"

# ============================================
# 3) CHECK/START SUPABASE
# ============================================
echo "🗄️  [PREFLIGHT] Vérification de Supabase..."

# Vérifier si Supabase CLI est installé
if ! command -v supabase &> /dev/null; then
  echo "   ⚠️  Supabase CLI non installé"
  echo "   → Installe avec: brew install supabase/tap/supabase"
  exit 1
fi

# Vérifier si Supabase est déjà démarré (check si le port 54321 répond)
if curl -s http://127.0.0.1:54321/health >/dev/null 2>&1; then
  echo "   ✓ Supabase déjà démarré"
else
  echo "   🚀 Démarrage de Supabase local..."
  supabase start
  echo "   ✅ Supabase démarré"
fi

echo ""
echo "✅ [PREFLIGHT] Préparation terminée!"
echo ""
