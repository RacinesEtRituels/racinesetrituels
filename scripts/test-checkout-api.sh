#!/usr/bin/env bash
set -euo pipefail
BASE=${BASE:-http://127.0.0.1:3000}
ORIGIN=${ORIGIN:-http://127.0.0.1:8000}
PSQL_DSN=${PSQL_DSN:-"postgresql://postgres:postgres@127.0.0.1:54322/postgres"}
JSON_FMT='jq -c'

fail() { echo "[FAIL] $*" >&2; exit 1; }

check_status() {
  local name=$1 method=$2 path=$3 body=$4 expect=$5
  echo "\n[Test] $name"
  local out status
  out=$(curl -s -i -X "$method" "$BASE$path" \
    -H "Origin: $ORIGIN" \
    -H "Content-Type: application/json" \
    -d "$body")
  status=$(printf "%s" "$out" | head -n1 | awk '{print $2}')
  printf "%s" "$out" | sed -n '1,5p'
  printf "%s" "$out" | tail -n+1 | grep -E '^\{' | head -n1 | ${JSON_FMT}
  [[ "$status" == "$expect" ]] || fail "$name expected $expect got $status"
}

echo "Using BASE=$BASE ORIGIN=$ORIGIN"

check_status "empty body" POST /create-checkout-session '{}' 400
check_status "quantity zero" POST /create-checkout-session '{"items":[{"product_id":"demo","quantity":0}]}' 400
check_status "unknown product" POST /create-checkout-session '{"items":[{"product_id":"unknown","quantity":1}]}' 400
check_status "demo product" POST /create-checkout-session '{"items":[{"product_id":"demo","quantity":1}]}' 400

# Real product check if available
REAL_SLUG=$(psql "$PSQL_DSN" -At -c "select slug from products where active=true limit 1" || true)
if [[ -n "$REAL_SLUG" ]]; then
  echo "Found product slug=$REAL_SLUG; testing happy path"
  check_status "real product" POST /create-checkout-session '{"items":[{"product_id":"'$REAL_SLUG'","quantity":1}]}' 200
else
  echo "No products found in DB; skip happy path"
fi
