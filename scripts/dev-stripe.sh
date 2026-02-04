#!/usr/bin/env bash

BACKEND_PORT="${PORT:-3000}"
BACKEND_URL="http://localhost:${BACKEND_PORT}"

echo "💳 [STRIPE] Démarrage de Stripe CLI..."

# Vérifier si Stripe CLI est installé
if ! command -v stripe &> /dev/null; then
  echo ""
  echo "⚠️  Stripe CLI non installé - webhook Stripe désactivé"
  echo "   → Pour l'installer: brew install stripe/stripe-cli/stripe"
  echo "   → Le dev continue sans webhooks Stripe locaux"
  echo ""
  # On ne fait pas échouer le dev, on affiche juste un message
  sleep infinity
  exit 0
fi

# Lancer stripe listen
echo "   🎧 Écoute des webhooks Stripe sur ${BACKEND_URL}/webhook/stripe"
stripe listen --forward-to "${BACKEND_URL}/webhook/stripe"
