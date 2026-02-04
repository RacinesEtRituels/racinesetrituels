# Dev Diagnostics (Stripe + Supabase + Front)

Local defaults: front `http://localhost:8000` (also `http://127.0.0.1:8000`), backend `http://localhost:3000`.

## 1) Frontend up on 8000

```bash
# Port open and process attached
lsof -i :8000

# HTTP 200 + headers (localhost)
curl -I http://localhost:8000/

# Same host via 127 (Safari sometimes prefers this)
curl -I http://127.0.0.1:8000/
```

## 2) Backend up on 3000 + CORS mirrors Origin

```bash
# Health
curl -I http://localhost:3000/health

# CORS should echo the Origin you send
curl -I -H "Origin: http://localhost:8000" http://localhost:3000/health | grep -i access-control-allow-origin
curl -I -H "Origin: http://127.0.0.1:8000" http://localhost:3000/health | grep -i access-control-allow-origin
```

## 3) Success page served correctly

```bash
# HTML 200 + content-type text/html
curl -I http://localhost:8000/success.html
curl -I http://127.0.0.1:8000/success.html

# JS 200 + application/javascript
curl -I http://localhost:8000/js/success.js
curl -I http://127.0.0.1:8000/js/success.js
```

## 4) Success flow without browser

```bash
# Requires SESSION_ID from Stripe Checkout
SESSION_ID="cs_test_123" \
curl -i "http://localhost:3000/public/order-by-session?session_id=${SESSION_ID}" \
  -H "Accept: application/json" \
  -H "Origin: http://localhost:8000"
```

Expect `HTTP/1.1 200` and a JSON body with `{"ok":true,"order":{...,"status":"paid"}}`. If paid, the success page will show "Paiement confirmé".

## 5) Safari-focused checklist (prioritized)

1. Service running? `lsof -i :8000` then `curl -I http://localhost:8000/` and `http://127.0.0.1:8000/`.
2. Wrong host? Switch URL to `http://127.0.0.1:8000/success.html?session_id=...`.
3. CORS/CSP? `curl -I -H "Origin: http://127.0.0.1:8000" http://localhost:3000/health` and confirm `access-control-allow-origin` matches the Origin.
4. Cache/cookies? Safari → Develop → Empty Caches, then reload; retry in a Private Window.
5. Private Relay/VPN/proxy? Disable iCloud Private Relay/VPN/proxy, retry.
6. Mixed content / HTTPS redirect? Confirm you are using plain HTTP URLs above; no HTTPS enforced locally.
7. Firewall? macOS Firewall/antivirus off or allow node/http-server; if blocked, retry after allowing.

If all above pass and it still fails, run the smoke test (see `scripts/smoke-success.mjs`).
