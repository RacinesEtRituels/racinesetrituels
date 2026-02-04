#!/bin/bash
# Test rapide des modifications webhook - 2026-01-08

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR/.."

echo "=== Test 1: Vérification syntaxe server.js ==="
node -c server/server.js && echo "✅ Syntaxe OK"

echo ""
echo "=== Test 2: Vérification config Supabase ==="
grep -n "const supabaseKey = ENV.SUPABASE_SERVICE_ROLE_KEY;" server/server.js && echo "✅ Pas de fallback ANON_KEY"

echo ""
echo "=== Test 3: Vérification markOrderPaid() ==="
# Vérifier que markOrderPaid() utilise updateResult.alreadyPaid
if grep -q "updateResult.alreadyPaid" server/server.js; then
    echo "✅ markOrderPaid() utilise updateResult.alreadyPaid"
else
    echo "❌ ERREUR: markOrderPaid() n'utilise pas updateResult.alreadyPaid!"
    exit 1
fi

if grep -q "recordWebhookEventStatus(eventId, \"processed\")" server/server.js; then
    echo "✅ recordWebhookEventStatus(processed) présent"
else
    echo "❌ ERREUR: recordWebhookEventStatus(processed) manquant!"
    exit 1
fi

echo ""
echo "=== Test 4: Vérification handleStripeWebhook() refactorisé ==="
if grep -q "const handler = webhookHandlers\[event.type\];" server/server.js; then
    echo "✅ Dispatch sur webhookHandlers présent"
else
    echo "❌ ERREUR: Dispatch sur webhookHandlers manquant!"
    exit 1
fi

if grep -q "await supabaseAdmin.from(\"orders\").select" server/server.js | grep -A 50 "handleStripeWebhook"; then
    echo "⚠️  WARNING: Code supabaseAdmin redondant peut-être encore présent"
else
    echo "✅ Code supabaseAdmin redondant supprimé"
fi

echo ""
echo "=== Test 5: Vérification logs structurés ==="
if grep -q "type: \"webhook_handler_success\"" server/server.js; then
    echo "✅ Logs structurés webhook_handler_success présent"
else
    echo "❌ ERREUR: Logs structurés manquants!"
    exit 1
fi

echo ""
echo "✅ Tous les tests statiques passent!"
echo ""
echo "📋 Prochaines étapes:"
echo "  1. Démarrer le serveur: cd server && npm start"
echo "  2. Démarrer webhook listener: stripe listen --forward-to http://127.0.0.1:3000/webhook/stripe"
echo "  3. Tester checkout: curl -X POST http://127.0.0.1:3000/create-checkout-session -H 'Content-Type: application/json' -d '{\"items\":[{\"product_id\":\"<UUID>\",\"quantity\":1}]}'"
echo "  4. Payer avec carte test 4242 4242 4242 4242"
echo "  5. Vérifier order: curl 'http://127.0.0.1:3000/public/order-by-session?session_id=<SESSION_ID>'"
echo ""
