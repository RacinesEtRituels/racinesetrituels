#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

PORT=8000
BASE_URL="http://127.0.0.1:${PORT}"
FRONT_CMD="npm run dev:front"
LOG_FILE="/tmp/e2e-frontend.log"
FRONT_PID=""
STARTED_FRONT=0

is_port_listening() {
  nc -z 127.0.0.1 "$PORT" >/dev/null 2>&1
}

start_front() {
  echo "[e2e] Starting frontend on ${BASE_URL}..."
  STARTED_FRONT=1
  set +e
  $FRONT_CMD >"$LOG_FILE" 2>&1 &
  FRONT_PID=$!
  set -e
}

stop_front() {
  if [[ "$STARTED_FRONT" -eq 1 && -n "$FRONT_PID" ]] && kill -0 "$FRONT_PID" >/dev/null 2>&1; then
    echo "[e2e] Stopping frontend (pid $FRONT_PID)"
    kill "$FRONT_PID" >/dev/null 2>&1 || true
  fi
}

trap stop_front EXIT INT TERM

if is_port_listening; then
  echo "[e2e] Frontend already listening on ${BASE_URL} (will leave it running)."
else
  start_front
  for i in {1..20}; do
    if is_port_listening; then
      echo "[e2e] Frontend is up"
      break
    fi
    sleep 1
    if [[ $i -eq 20 ]]; then
      echo "[e2e] Frontend failed to start on ${BASE_URL}; tail $LOG_FILE for details." >&2
      exit 1
    fi
  done
fi

echo "[e2e] Validating served config..."
node scripts/check-served-config.js

echo "[e2e] Running Playwright tests..."
npx playwright test tests/ui-products.spec.js
