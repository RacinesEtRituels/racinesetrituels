-- Stripe-related tables beyond the core e-commerce schema.
--
-- IMPORTANT:
-- - Core tables (products/customers/orders/order_items/webhook_events/inventory_movements)
--   are created in 0001_bootstrap.sql.
-- - This migration must remain safe on a totally empty database.
-- - Therefore: no unguarded ALTER TABLE.

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Subscriptions (used by server + frontend)
CREATE TABLE IF NOT EXISTS public.subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  stripe_subscription_id text UNIQUE,
  stripe_customer_id text,
  status text,
  price_id text,
  interval text,
  current_period_start timestamptz,
  current_period_end timestamptz,
  cancel_at_period_end boolean,
  canceled_at timestamptz,
  metadata jsonb,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS subscriptions_customer_idx ON public.subscriptions(stripe_customer_id);

-- Print queue (used by server)
CREATE TABLE IF NOT EXISTS public.print_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid REFERENCES public.orders(id),
  payload jsonb,
  status text DEFAULT 'queued',
  created_at timestamptz DEFAULT now(),
  processed_at timestamptz
);
CREATE INDEX IF NOT EXISTS print_jobs_status_idx ON public.print_jobs(status);

-- Outbox / integrations (used by server)
CREATE TABLE IF NOT EXISTS public.integration_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  type text,
  payload jsonb,
  status text DEFAULT 'pending',
  attempts integer DEFAULT 0,
  last_error text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS integration_events_status_idx ON public.integration_events(status);

