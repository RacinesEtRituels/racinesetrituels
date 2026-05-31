#!/usr/bin/env bash
set -Eeuo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

BACKEND_PORT="${PORT:-3000}"
FRONTEND_PORT="${FRONTEND_PORT:-8000}"
BACKEND_URL="${BACKEND_URL:-http://localhost:${BACKEND_PORT}}"
START_STRIPE="${START_STRIPE:-1}"
LOG_DIR="${LOG_DIR:-${TMPDIR:-/tmp}/racinesetrituels-dev-logs}"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'

log() { echo -e "${CYAN}[DEV]${NC} $1"; }
ok() { echo -e "${GREEN}[DEV]${NC} ✅ $1"; }
warn() { echo -e "${YELLOW}[DEV]${NC} ⚠️  $1"; }
fail() { echo -e "${RED}[DEV]${NC} ❌ $1"; }

BACKEND_PID=""
FRONTEND_PID=""
STRIPE_PID=""

cleanup() {
  echo ""
  log "Arrêt des services lancés par ce script..."
  [ -n "$BACKEND_PID" ] && kill "$BACKEND_PID" 2>/dev/null || true
  [ -n "$FRONTEND_PID" ] && kill "$FRONTEND_PID" 2>/dev/null || true
  [ -n "$STRIPE_PID" ] && kill "$STRIPE_PID" 2>/dev/null || true
  ok "Services arrêtés"
}
trap cleanup EXIT INT TERM

kill_port() {
  local port="$1"
  local pids
  pids="$(lsof -ti ":${port}" 2>/dev/null || true)"
  if [ -z "$pids" ]; then
    log "Port ${port} libre"
    return
  fi

  warn "Port ${port} occupé par PID(s): ${pids}"
  kill $pids 2>/dev/null || true
  sleep 0.8

  pids="$(lsof -ti ":${port}" 2>/dev/null || true)"
  if [ -n "$pids" ]; then
    warn "Port ${port} encore occupé, arrêt forcé: ${pids}"
    kill -9 $pids 2>/dev/null || true
    sleep 0.3
  fi
  ok "Port ${port} libéré"
}

wait_for_url() {
  local url="$1"
  local label="$2"
  local max="${3:-30}"
  for _ in $(seq 1 "$max"); do
    if curl -fsS --max-time 2 "$url" >/dev/null 2>&1; then
      ok "${label} répond"
      return 0
    fi
    sleep 1
  done
  fail "${label} ne répond pas: ${url}"
  return 1
}

mkdir -p "$LOG_DIR"
: > "${LOG_DIR}/backend.log"
: > "${LOG_DIR}/frontend.log"
: > "${LOG_DIR}/stripe.log"

log "Nettoyage ports ${BACKEND_PORT}/${FRONTEND_PORT} et anciens stripe listen..."
pkill -f "stripe listen" 2>/dev/null || true
kill_port "$BACKEND_PORT"
kill_port "$FRONTEND_PORT"

if [ "$START_STRIPE" = "1" ]; then
  if command -v stripe >/dev/null 2>&1; then
    log "Démarrage Stripe CLI → ${BACKEND_URL}/webhook/stripe"
    stripe listen --forward-to "${BACKEND_URL}/webhook/stripe" > "${LOG_DIR}/stripe.log" 2>&1 &
    STRIPE_PID="$!"

    for _ in $(seq 1 12); do
      if grep -q "whsec_" "${LOG_DIR}/stripe.log" 2>/dev/null; then
        STRIPE_WEBHOOK_SECRET="$(grep -o 'whsec_[A-Za-z0-9_]*' "${LOG_DIR}/stripe.log" | head -n 1)"
        export STRIPE_WEBHOOK_SECRET
        ok "Stripe CLI actif et secret webhook injecté dans le backend local"
        break
      fi
      sleep 1
    done

    if [ -z "${STRIPE_WEBHOOK_SECRET:-}" ]; then
      warn "Secret webhook Stripe non détecté dans ${LOG_DIR}/stripe.log; backend utilisera .env.local"
    fi
  else
    warn "Stripe CLI non installé; webhooks non lancés"
  fi
else
  warn "Stripe CLI désactivé (START_STRIPE=0)"
fi

log "Démarrage backend Express sur ${BACKEND_URL}"
MAIL_HOST="${MAIL_HOST:-127.0.0.1}" PORT="$BACKEND_PORT" NODE_ENV=development node server/server.js > "${LOG_DIR}/backend.log" 2>&1 &
BACKEND_PID="$!"
wait_for_url "${BACKEND_URL}/health" "Backend"

log "Démarrage frontend statique sur http://127.0.0.1:${FRONTEND_PORT}"
FRONTEND_PORT="$FRONTEND_PORT" BACKEND_URL="$BACKEND_URL" npm run dev:frontend > "${LOG_DIR}/frontend.log" 2>&1 &
FRONTEND_PID="$!"
wait_for_url "http://127.0.0.1:${FRONTEND_PORT}/" "Frontend"

if curl -fsS "http://127.0.0.1:${FRONTEND_PORT}/" | grep -q "Index of /"; then
  fail "Le frontend sert encore un listing de dossier"
  exit 1
fi

echo ""
echo "Racines & Rituels dev prêt"
echo "──────────────────────────"
echo "Frontend : http://127.0.0.1:${FRONTEND_PORT}"
echo "Backend  : ${BACKEND_URL}"
echo "Health   : ${BACKEND_URL}/health"
if [ -n "$STRIPE_PID" ]; then
  echo "Stripe   : forward ${BACKEND_URL}/webhook/stripe"
else
  echo "Stripe   : non lancé"
fi
echo ""
echo "Logs :"
echo "  tail -f ${LOG_DIR}/backend.log"
echo "  tail -f ${LOG_DIR}/frontend.log"
echo "  tail -f ${LOG_DIR}/stripe.log"
echo ""
echo "Ctrl+C arrête les services lancés par ce script."
echo ""

wait
