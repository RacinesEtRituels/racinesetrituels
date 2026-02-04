# Runbook – Racines & Rituels (local)

## Prérequis

- Node 18+
- Docker Desktop (pour Supabase + Mailpit)
- Supabase CLI (`brew install supabase/tap/supabase`)
- Stripe CLI (`brew install stripe/stripe-cli/stripe`)

## Configuration

1. Copier `.env.example` vers `.env` et renseigner les clés (Stripe, Supabase service_role, Mail).
2. Vérifier `js/config.js` pour le front (BACKEND_URL, SUPABASE_URL/ANON_KEY pour le reste du front).

## Démarrage local

```bash
npm install
npm run db:migrate  # applique les migrations SQL server/sql/*.sql
npm run dev         # backend 3000, front 8000
```

Supabase UI: http://127.0.0.1:54323
Mailpit UI: http://127.0.0.1:54326 (SMTP sur 54325)

## Stripe webhooks

```bash
stripe listen --forward-to http://localhost:3000/webhook/stripe
# Copier whsec_xxx dans STRIPE_WEBHOOK_SECRET (.env)
```

## Vérifications rapides

```bash
curl -i http://localhost:3000/health
curl -i http://localhost:3000/ready
curl -i "http://localhost:3000/public/order-by-session"
curl -i "http://localhost:3000/public/order-by-session?session_id=bad"  # 400 invalid
npm run test:smoke
```

Après un checkout payé, ouvrir: http://localhost:8000/success.html?session*id=cs_test*...

## Logs / Observabilité

- Logs JSON avec `x-correlation-id` sur chaque requête
- Webhooks: logs type `webhook_event_received`, `webhook_order_updated`
- Emails: `email_sent` / `email_failed`

## Mail

- Mailpit SMTP: host 127.0.0.1, port 54325
- Email envoyé dans le webhook si statut passe à paid et pas déjà envoyé

## Dépannage

- 503 sur /ready: vérifier SUPABASE_URL/SERVICE_ROLE et STRIPE_WEBHOOK_SECRET
- Email non reçu: voir logs `email_failed` et Mailpit UI
- Rate limit: env RATE_LIMIT_WINDOW_MS / RATE_LIMIT_MAX
