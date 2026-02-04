#!/usr/bin/env bash
set -euo pipefail
ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT_DIR"

BASE_BACKEND="http://127.0.0.1:3000"
BASE_FRONT="http://127.0.0.1:8000"
SUPA_URL=${SUPABASE_URL:-"http://127.0.0.1:54321"}
SUPA_KEY=${SUPABASE_SERVICE_ROLE_KEY:-${SUPABASE_ANON_KEY:-}}

fail() { echo "[FAIL] $*" >&2; exit 1; }
pass() { echo "[PASS] $*"; }

# 1) config sanity
if ! grep -q "BACKEND_URL" js/config.js; then fail "BACKEND_URL missing in js/config.js"; fi
if ! grep -q "127.0.0.1:3000" js/config.js; then fail "BACKEND_URL not set to 127.0.0.1:3000"; fi
pass "config.js backend URL is 127.0.0.1:3000"

# 2) ports listening
lsof -nP -iTCP:3000 -sTCP:LISTEN >/dev/null || fail "no listener on 3000"
pass "port 3000 listening"

lsof -nP -iTCP:8000 -sTCP:LISTEN >/dev/null || fail "no listener on 8000"
pass "port 8000 listening"

# 3) health
curl -sf "$BASE_BACKEND/health" >/dev/null || fail "/health failed"
pass "backend /health ok"

# 4) front success page
curl -sf "$BASE_FRONT/success.html" >/dev/null || fail "success.html not reachable"
pass "success.html reachable"

# 5) supabase REST
if [[ -z "$SUPA_KEY" ]]; then fail "SUPABASE key missing"; fi
curl -sf "$SUPA_URL/rest/v1/orders?select=id&limit=1" -H "apikey: $SUPA_KEY" -H "Authorization: Bearer $SUPA_KEY" >/dev/null || fail "Supabase REST orders check failed"
pass "Supabase REST reachable"

# 6) preflight OPTIONS
for ORIGIN in "http://127.0.0.1:8000" "http://localhost:8000"; do
  curl -si -X OPTIONS "$BASE_BACKEND/create-checkout-session" \
    -H "Origin: $ORIGIN" \
    -H "Access-Control-Request-Method: POST" \
    -H "Access-Control-Request-Headers: content-type" | head -n1 | grep -q "204" || fail "preflight failed for $ORIGIN"
  pass "preflight ok for $ORIGIN"
done

# 7) pick product slug
SLUG=$(psql "${PSQL_DSN:-postgresql://postgres:postgres@127.0.0.1:54322/postgres}" -At -c "select slug from products where active=true limit 1" | head -n1 || true)
[[ -n "$SLUG" ]] || fail "no active product slug found"
pass "found product slug=$SLUG"

# 8) create checkout session
RESP=$(curl -s -w "\n%{http_code}" -X POST "$BASE_BACKEND/create-checkout-session" \
  -H "Origin: http://127.0.0.1:8000" \
  -H "Content-Type: application/json" \
  -d "{\"items\":[{\"product_slug\":\"$SLUG\",\"quantity\":1}]}")
BODY=$(printf "%s" "$RESP" | head -n1)
STATUS=$(printf "%s" "$RESP" | tail -n1)
if [[ "$STATUS" != "200" ]]; then
  fail "checkout expected 200 got $STATUS body=$BODY"
fi
SESSION=$(printf "%s" "$BODY" | grep -o '"session_id":"[^"]*"' | head -n1 | cut -d'"' -f4)
URL=$(printf "%s" "$BODY" | grep -o '"url":"[^"]*"' | head -n1 | cut -d'"' -f4)
[[ -n "$SESSION" && -n "$URL" ]] || fail "missing session/url in response"
pass "checkout ok session=$SESSION"

echo "Success URL: $URL"

echo "All smoke checks passed"
