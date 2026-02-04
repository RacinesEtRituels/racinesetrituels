#!/usr/bin/env bash
set -euo pipefail

BACKEND=${BACKEND_URL:-http://localhost:3000}
ORIGINS=("http://localhost:8000" "http://127.0.0.1:8000")

curl_opts=(-s -D - -o /tmp/cors_body.$$)

check() {
  local desc=$1; shift
  echo "---- ${desc} ----"
  curl "${curl_opts[@]}" "$@" | awk 'NR==1||/Access-Control-Allow-Origin|Access-Control-Allow-Methods|Access-Control-Allow-Headers|Access-Control-Max-Age/ {print}'
  echo ""
}

for origin in "${ORIGINS[@]}"; do
  echo "=== Origin: ${origin} ==="
  check "GET /health" -H "Origin: ${origin}" "${BACKEND}/health"
  check "OPTIONS /create-checkout-session" -X OPTIONS -H "Origin: ${origin}" -H "Access-Control-Request-Method: POST" -H "Access-Control-Request-Headers: content-type" "${BACKEND}/create-checkout-session"
  check "POST /create-checkout-session" -X POST -H "Origin: ${origin}" -H "Content-Type: application/json" -d '{"items":[]}' "${BACKEND}/create-checkout-session"
  echo ""
done

echo "Expected: ACAO matches Origin, ACM allows GET,POST,OPTIONS; headers include Content-Type, Authorization, X-Requested-With; Max-Age=600; OPTIONS returns 204."
