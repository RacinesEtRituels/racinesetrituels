#!/usr/bin/env bash
#
# scripts/dev.sh
# Workflow de développement ultra-stable pour racinesetrituels
# - Kill ports automatique (3000, 8000)
# - Check Docker
# - Start Supabase (idempotent)
# - Lance backend + frontend + Stripe CLI (optionnel)
# - Logs clairs et résumé final
#

set -e

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

# ============================================
# Configuration
# Ne lance pas d'autre "stripe listen" quand ce script tourne.
# Tout le stack doit pointer vers le même BACKEND_URL.
# ============================================
BACKEND_PORT="${PORT:-3000}"
BACKEND_URL="http://localhost:${BACKEND_PORT}"
FRONTEND_PORT=8000
SUPABASE_URL="http://127.0.0.1:54321"

# ============================================
# Couleurs pour les logs
# ============================================
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

log_info() {
  echo -e "${CYAN}[DEV]${NC} $1"
}

log_success() {
  echo -e "${GREEN}[DEV]${NC} ✅ $1"
}

log_warning() {
  echo -e "${YELLOW}[DEV]${NC} ⚠️  $1"
}

log_error() {
  echo -e "${RED}[DEV]${NC} ❌ $1"
}

# ============================================
# 1) KILL PORTS + STRIPE LISTEN
# ============================================
log_info "Nettoyage des ports ${BACKEND_PORT} et ${FRONTEND_PORT} + stripe listen..."

log_info "Kill stripe listen en cours..."
stripe_pids=$(pgrep -f "stripe listen" 2>/dev/null || true)
if [ -n "$stripe_pids" ]; then
  log_warning "stripe listen actif: $stripe_pids (kill)"
  kill -9 $stripe_pids 2>/dev/null || true
else
  log_info "Pas de stripe listen actif"
fi

kill_port() {
  local port=$1
  local pids=$(lsof -ti :$port 2>/dev/null || true)
  if [ -n "$pids" ]; then
    log_warning "Port $port occupé par PID(s): $pids"
    kill -9 $pids 2>/dev/null || true
    sleep 0.3
    log_success "Port $port libéré"
  else
    log_info "Port $port déjà libre"
  fi
}

kill_port $BACKEND_PORT
kill_port $FRONTEND_PORT

# ============================================
# 2) CHECK DOCKER
# ============================================
log_info "Vérification de Docker..."

if ! docker info >/dev/null 2>&1; then
  log_error "Docker n'est pas démarré!"
  echo ""
  echo "  → Lance Docker Desktop"
  echo "  → Puis relance: npm run dev"
  echo ""
  exit 1
fi

log_success "Docker opérationnel"

# ============================================
# 3) START SUPABASE (idempotent)
# ============================================
log_info "Démarrage de Supabase local..."

if ! command -v supabase &> /dev/null; then
  log_error "Supabase CLI non installé"
  echo ""
  echo "  → Installe avec: brew install supabase/tap/supabase"
  echo ""
  exit 1
fi

# Check si Supabase répond déjà
if curl -s --max-time 2 "${SUPABASE_URL}/health" >/dev/null 2>&1; then
  log_success "Supabase déjà démarré"
else
  log_info "Lancement de Supabase (peut prendre 30-60s)..."
  supabase start
  log_success "Supabase démarré"
fi

# ============================================
# 3bis) MAILPIT DISCOVERY
# ============================================
log_info "Recherche du conteneur Mailpit (max 20s)..."

MAILPIT_LINE=""
for i in $(seq 1 20); do
  MAILPIT_LINE=$(docker ps --format '{{.Names}} {{.Ports}}' | grep -i mailpit | head -n 1 || true)
  if [ -n "$MAILPIT_LINE" ]; then
    log_success "Mailpit détecté"
    break
  fi
  sleep 1
done

MAILPIT_SMTP_PORT=$(node "$ROOT_DIR/scripts/detect-mail-smtp.mjs" 2>/dev/null || true)
MAILPIT_UI_PORT=""

if [ -n "$MAILPIT_LINE" ]; then
  MAILPIT_UI_PORT=$(echo "$MAILPIT_LINE" | perl -nle 'print $1 if /:([0-9]+)->8025\/tcp/' | head -n 1)
fi

if [ -z "$MAILPIT_SMTP_PORT" ]; then
  log_warning "SMTP Mailpit non détecté (fallback 54325 côté backend)"
else
  log_info "SMTP Mailpit détecté sur localhost:${MAILPIT_SMTP_PORT}"
fi

if [ -z "$MAILPIT_UI_PORT" ]; then
  log_warning "Mailpit UI non détectée (contourne l'UI inbucket sur 54324)"
else
  log_info "Mailpit UI: http://127.0.0.1:${MAILPIT_UI_PORT}"
fi

# ============================================
# 4) BACKEND EXPRESS
# ============================================
log_info "Démarrage du backend Express (port ${BACKEND_PORT})..."

MAIL_HOST=127.0.0.1 PORT=${BACKEND_PORT} NODE_ENV=development node server/server.js > logs/backend.log 2>&1 &
BACKEND_PID=$!

# Attendre que le backend réponde
sleep 2
if curl -s --max-time 3 "${BACKEND_URL}/health" >/dev/null 2>&1; then
  log_success "Backend opérationnel (PID: ${BACKEND_PID})"
else
  log_error "Backend ne répond pas"
  kill $BACKEND_PID 2>/dev/null || true
  exit 1
fi

# ============================================
# 5) FRONTEND STATIQUE
# ============================================
log_info "Démarrage du frontend (port ${FRONTEND_PORT})..."

npm run dev:front > logs/frontend.log 2>&1 &
FRONTEND_PID=$!

sleep 1
if ! lsof -ti :${FRONTEND_PORT} >/dev/null 2>&1; then
  log_error "Frontend non démarré (port ${FRONTEND_PORT} non ouvert)"
  [ -n "$BACKEND_PID" ] && kill $BACKEND_PID 2>/dev/null || true
  [ -n "$FRONTEND_PID" ] && kill $FRONTEND_PID 2>/dev/null || true
  exit 1
fi

if curl -s --max-time 2 http://localhost:${FRONTEND_PORT}/ >/dev/null 2>&1 \
  && curl -s --max-time 2 http://127.0.0.1:${FRONTEND_PORT}/ >/dev/null 2>&1; then
  log_success "Frontend opérationnel (PID: ${FRONTEND_PID}) sur localhost et 127.0.0.1"
else
  log_error "Frontend ne répond pas sur localhost:${FRONTEND_PORT} ou 127.0.0.1:${FRONTEND_PORT}"
  [ -n "$BACKEND_PID" ] && kill $BACKEND_PID 2>/dev/null || true
  [ -n "$FRONTEND_PID" ] && kill $FRONTEND_PID 2>/dev/null || true
  exit 1
fi

# ============================================
# 6) STRIPE CLI (optionnel)
# ============================================
if command -v stripe &> /dev/null; then
  log_info "Démarrage de Stripe CLI webhooks..."
  stripe listen --forward-to "${BACKEND_URL}/webhook/stripe" > logs/stripe.log 2>&1 &
  STRIPE_PID=$!
  log_success "Stripe CLI actif (PID: ${STRIPE_PID}) → forward ${BACKEND_URL}/webhook/stripe"
else
  log_warning "Stripe CLI non installé (optionnel)"
  echo "         → Pour l'installer: brew install stripe/stripe-cli/stripe"
  STRIPE_PID=""
fi

# ============================================
# 7) RÉSUMÉ ET ATTENTE
# ============================================
echo ""
echo "╔═══════════════════════════════════════════════════════════════════════╗"
echo "║              🌿 RACINES & RITUELS - DEV MODE                         ║"
echo "╚═══════════════════════════════════════════════════════════════════════╝"
echo ""
echo "📦 SERVICES DÉMARRÉS:"
echo "────────────────────────────────────────────────────────────────────────"
echo "  🌐 Frontend (static)  → http://localhost:${FRONTEND_PORT}"
echo "  🌐 Frontend (loopback)→ http://127.0.0.1:${FRONTEND_PORT}"
echo "  🔌 Backend API        → ${BACKEND_URL}"
echo "  📊 Backend Health     → ${BACKEND_URL}/health"
echo "  🗄️  Supabase Studio   → http://127.0.0.1:54323"
echo "  💾 Supabase API       → ${SUPABASE_URL}"
if [ -n "$MAILPIT_SMTP_PORT" ]; then
  echo "  📧 Mailpit SMTP      → localhost:${MAILPIT_SMTP_PORT}"
else
  echo "  📧 Mailpit SMTP      → non détecté (fallback 54325)"
fi
if [ -n "$MAILPIT_UI_PORT" ]; then
  echo "  📮 Mailpit UI        → http://127.0.0.1:${MAILPIT_UI_PORT}"
else
  echo "  📮 Mailpit UI        → non détectée"
fi
if [ -n "$STRIPE_PID" ]; then
  echo "  💳 Stripe Webhooks    → Actif (PID: ${STRIPE_PID})"
else
  echo "  💳 Stripe Webhooks    → Non disponible"
fi
echo "  🧭 Safari succès     → http://localhost:${FRONTEND_PORT}/success.html?session_id=<votre_session>"
echo "                        http://127.0.0.1:${FRONTEND_PORT}/success.html?session_id=<votre_session>"
echo ""
echo "────────────────────────────────────────────────────────────────────────"
echo "🧪 TESTS RAPIDES:"
echo "────────────────────────────────────────────────────────────────────────"
echo ""
echo "  # Health check"
echo "  curl ${BACKEND_URL}/health"
echo ""
echo "  # Test checkout avec produit réel"
echo "  npm run test:checkout"
echo ""
echo "────────────────────────────────────────────────────────────────────────"
echo "📝 LOGS:"
echo "────────────────────────────────────────────────────────────────────────"
echo "  Backend:  tail -f logs/backend.log"
echo "  Frontend: tail -f logs/frontend.log"
if [ -n "$STRIPE_PID" ]; then
  echo "  Stripe:   tail -f logs/stripe.log"
  echo "  Forward:  ${BACKEND_URL}/webhook/stripe"
fi
echo ""
echo "────────────────────────────────────────────────────────────────────────"
echo "⌨️  Ctrl+C pour arrêter tous les services"
echo "────────────────────────────────────────────────────────────────────────"
echo ""

# Validation légère: détecter un forward incorrect dans les logs Stripe
if [ -f logs/stripe.log ]; then
  if [ "$BACKEND_PORT" = "3000" ] && grep -q "localhost:3001/webhook/stripe" logs/stripe.log 2>/dev/null; then
    log_error "stripe.log contient un forward vers 3001 alors que BACKEND_PORT=3000 (anciennes sessions stripe listen ?)"
  fi
  if [ "$BACKEND_PORT" != "3000" ] && grep -q "localhost:3000/webhook/stripe" logs/stripe.log 2>/dev/null; then
    log_warning "stripe.log contient un forward vers 3000 alors que BACKEND_PORT=${BACKEND_PORT}"
  fi
fi

# Avertir si le code contient un forward hardcodé 3000 quand on est sur un autre port
if [ "$BACKEND_PORT" != "3000" ]; then
  if grep -R "localhost:3000/webhook/stripe" . 2>/dev/null | head -n 1 | grep -q ""; then
    log_warning "Des références à localhost:3000/webhook/stripe existent encore dans le repo (à mettre à jour pour ce port)."
  fi
fi

# ============================================
# 8) CLEANUP AU EXIT
# ============================================
cleanup() {
  echo ""
  log_info "Arrêt des services..."
  
  [ -n "$BACKEND_PID" ] && kill $BACKEND_PID 2>/dev/null || true
  [ -n "$FRONTEND_PID" ] && kill $FRONTEND_PID 2>/dev/null || true
  [ -n "$STRIPE_PID" ] && kill $STRIPE_PID 2>/dev/null || true
  
  log_success "Services arrêtés"
}

trap cleanup EXIT INT TERM

# Garder le script actif
wait
