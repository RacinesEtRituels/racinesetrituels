# Backend Stripe + Supabase

## Environnement

- Front statique: http://localhost:8000
- Backend: http://localhost:3000
- Webhook local: Stripe CLI uniquement (`stripe listen --forward-to localhost:3000/webhook/stripe`)
- Secrets: server/.env (STRIPE*SECRET_KEY, STRIPE_WEBHOOK_SECRET=whsec*..., SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, optional PRINT_DISPATCH_SECRET)
- Mailpit (Supabase local): UI http://127.0.0.1:54324, SMTP 127.0.0.1:54325
- Vars mail: MAIL_HOST (default 127.0.0.1), MAIL_PORT (default 54325), MAIL_SECURE (false), MAIL_FROM (default no-reply@racinesetrituels.local)

## Webhooks (local vs prod)

- Local: ne pas enregistrer d’URL dans le dashboard Stripe. Utiliser Stripe CLI: `stripe listen --forward-to localhost:3000/webhook/stripe` puis copier le whsec dans server/.env.
- Prod: configurer l’URL publique (ex: https://api.example.com/webhook/stripe) dans le dashboard et définir STRIPE_WEBHOOK_SECRET correspondant.

## Démarrage local

- `cd server && npm start` (chemin avec espaces supporté)
- Stripe CLI: `stripe listen --forward-to localhost:3000/webhook/stripe`
- Tester: `stripe trigger checkout.session.completed` ou `stripe trigger invoice.paid`

## Schéma / migrations

- Voir `sql/001_stripe_supabase.sql` (copier/coller dans l’éditeur SQL Supabase). Ajoute colonnes orders, stocks products, tables customers/subscriptions/webhook_events/inventory_movements/print_jobs/integration_events, fonction `decrement_stock_for_order`.

## Points clés implémentés

- Idempotence webhook via table `webhook_events` + statut.
- Pricing serveur: recalcul via Supabase products avant Stripe Checkout.
- orders créées en pending puis mises à jour en paid sur webhook; stockage stripe_session_id, payment_intent, customer, shipping, currency.
- Stock décrémenté via RPC `decrement_stock_for_order` (atomique) + audit `inventory_movements`.
- Files d’attente: `print_jobs` (endpoint /print/dispatch), `integration_events` (outbox Make/Notion).
- Subscriptions synchronisées sur `invoice.paid` et `customer.subscription.*`.

## Vérifications rapides

1. Health: `curl http://localhost:3000/health`
2. Checkout flow: POST /create-checkout-session avec items {product_id, quantity}, suivre redirection Stripe, vérifier orders/order_items et stock.
3. Webhook local: `stripe trigger checkout.session.completed` → orders.status=paid, inventory_movements, print_jobs queued.
4. Abonnement: `stripe trigger invoice.paid` → subscriptions upsert, integration_events en attente.
5. Impression: POST /print/dispatch avec header `x-print-secret` (si défini) pour récupérer les jobs queued.

## Smoke test checkout (local)

1. Lancer le backend: `cd server && npm start`.
2. Stripe CLI: `stripe listen --forward-to localhost:3000/webhook/stripe` (copier le whsec dans .env si besoin).
3. Créer une session: appeler /create-checkout-session (ou via l'UI) et vérifier dans les logs que l'order pending est créé + metadata order_id injectée dans la session.
4. Simuler le webhook: `stripe trigger checkout.session.completed` et observer dans les logs l'UPDATE de l'order (pas d'INSERT).
5. Vérifier Supabase: aucune nouvelle ligne orders; la ligne existante doit être passée en paid avec stripe_session_id, stripe_payment_intent_id et paid_at mis à jour.
