#!/usr/bin/env bash
set -euo pipefail
BASE=${BASE:-http://127.0.0.1:3000}
ORIGIN=${ORIGIN:-http://127.0.0.1:8000}
PSQL_DSN=${PSQL_DSN:-"postgresql://postgres:postgres@127.0.0.1:54322/postgres"}
ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT_DIR"

slug=$(psql "$PSQL_DSN" -At -c "select slug from products where active=true limit 1" | head -n1 || true)
uuid=$(psql "$PSQL_DSN" -At -c "select id from products where active=true limit 1" | head -n1 || true)

fail() { echo "[FAIL] $*" >&2; exit 1; }

curl_status() {
  local payload=$1
  curl -s -o /dev/null -w "%{http_code}" -X POST "$BASE/create-checkout-session" \
    -H "Origin: $ORIGIN" \
    -H "Content-Type: application/json" \
    -d "$payload"
}

echo "Using BASE=$BASE ORIGIN=$ORIGIN slug=$slug uuid=$uuid"

[[ -n "$slug" ]] || fail "no active product slug"
[[ -n "$uuid" ]] || fail "no active product uuid"

# slug succeeds
status=$(curl_status "{\"items\":[{\"product_id\":\"$slug\",\"quantity\":1}]}")
[[ "$status" == "200" ]] || fail "slug expected 200 got $status"

# uuid succeeds
status=$(curl_status "{\"items\":[{\"product_id\":\"$uuid\",\"quantity\":1}]}")
[[ "$status" == "200" ]] || fail "uuid expected 200 got $status"

# unknown slug fails 400
status=$(curl_status "{\"items\":[{\"product_id\":\"unknown-slug-zzz\",\"quantity\":1}]}")
[[ "$status" == "400" ]] || fail "unknown slug expected 400 got $status"

# invalid uuid string fails 400
status=$(curl_status "{\"items\":[{\"product_id\":\"not-a-uuid\",\"quantity\":1}]}")
[[ "$status" == "400" ]] || fail "invalid uuid expected 400 got $status"

# quantity 0 fails 400
status=$(curl_status "{\"items\":[{\"product_id\":\"$slug\",\"quantity\":0}]}")
[[ "$status" == "400" ]] || fail "quantity 0 expected 400 got $status"

echo "[PASS] resolver checks succeeded"
