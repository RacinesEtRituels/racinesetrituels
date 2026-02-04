#!/usr/bin/env bash
set -euo pipefail
BASE=${BASE:-http://127.0.0.1:3000}
ORIGIN=${ORIGIN:-http://127.0.0.1:8000}
PSQL_DSN=${PSQL_DSN:-"postgresql://postgres:postgres@127.0.0.1:54322/postgres"}
ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT_DIR"

echo "[STEP] syncing Stripe products via scripts/dev-sync-stripe-products.sh"
NODE_ENV=${NODE_ENV:-development} bash "$ROOT_DIR/scripts/dev-sync-stripe-products.sh"

echo "[STEP] picking active product slug"
SLUG=$(psql "$PSQL_DSN" -At -c "select slug from products where active=true limit 1" | head -n1 || true)
UUID=$(psql "$PSQL_DSN" -At -c "select id from products where active=true limit 1" | head -n1 || true)
if [[ -z "$SLUG" ]]; then
  echo "[FAIL] no active product slug found"
  exit 1
fi

echo "Using BASE=$BASE ORIGIN=$ORIGIN slug=$SLUG uuid=$UUID"

PAYLOAD=$(printf '{"items":[{"product_id":"%s","quantity":1}]}' "$SLUG")
RESP=$(curl -s -i -X POST "$BASE/create-checkout-session" \
  -H "Origin: $ORIGIN" \
  -H "Content-Type: application/json" \
  -d "$PAYLOAD")

STATUS=$(printf "%s" "$RESP" | head -n1 | awk '{print $2}')
CORR=$(printf "%s" "$RESP" | tr -d '\r' | grep -i '^x-correlation-id:' | tail -n1 | awk '{print $2}')
BODY=$(printf "%s" "$RESP" | sed -n '/^{/,$p' | tr -d '\r')

echo "Status: $STATUS"
[[ -n "$CORR" ]] && echo "Correlation-ID: $CORR"
printf "%s\n" "$BODY"

if [[ "$STATUS" != "200" ]]; then
  echo "[FAIL] expected 200 from checkout, got $STATUS"
  exit 1
fi

BODY_JSON=$BODY node - <<'NODE'
const body = process.env.BODY_JSON || "";
let parsed;
try {
  parsed = JSON.parse(body);
} catch (err) {
  console.error("[FAIL] response is not valid JSON");
  process.exit(1);
}
if (!parsed.url || !parsed.session_id) {
  console.error("[FAIL] missing url or session_id in response");
  process.exit(1);
}
console.log("[PASS] checkout returned session", { session_id: parsed.session_id });
NODE

if [[ -n "$UUID" ]]; then
  echo "[STEP] testing UUID input"
  PAYLOAD_UUID=$(printf '{"items":[{"product_id":"%s","quantity":1}]}' "$UUID")
  STATUS_UUID=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$BASE/create-checkout-session" \
    -H "Origin: $ORIGIN" \
    -H "Content-Type: application/json" \
    -d "$PAYLOAD_UUID")
  if [[ "$STATUS_UUID" != "200" ]]; then
    echo "[FAIL] UUID checkout expected 200 got $STATUS_UUID"
    exit 1
  fi
  echo "[PASS] UUID input accepted"
fi
