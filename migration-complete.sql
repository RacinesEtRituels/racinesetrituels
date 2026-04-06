-- =================================================================
-- migration-complete.sql — Racines & Rituels
-- Projet Supabase Cloud : fjfutavsdlnernwtdsfu (Racines-Core, London)
--
-- À exécuter UNE SEULE FOIS dans :
-- Supabase Dashboard > SQL Editor > New query
--
-- Ordre des migrations incluses :
--   1. 0001_bootstrap.sql          — tables de base (products, orders, order_items...)
--   2. 20251221_stripe.sql         — tables Stripe (webhook_events...)
--   3. 20251222_create_products.sql — no-op / dépréciée
--   4. 20251223_add_user_id.sql    — user_id sur orders
--   5. 001_stripe_supabase.sql     — patch idempotent global
--   6. 002_orders_stripe_hardening — stripe_payment_intent_id
--   7. 003_orders_updated_at       — updated_at + trigger
--   8. 004_orders_receipt_email    — customer_email, amount_total, currency
--   9. 005_orders_customer_email   — doublon sécurisé de 004
--  10. 20260323_upsert_products    — insert khamare, hibiscus-blanc, hibiscus-rouge
--
-- ⚠️  prod_khamare_placeholder etc. : remplacer par les vrais prod_...
--     depuis Stripe Dashboard > Products avant d exécuter.
-- =================================================================

-- ============================================================
-- MIGRATION : 0001_bootstrap.sql
-- ============================================================
-- Bootstrap schema for Racines & Rituels (idempotent-friendly)
-- Applies cleanly on empty databases (Supabase local or cloud)

-- Extensions
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- =============================================
-- Tables
-- =============================================
CREATE TABLE IF NOT EXISTS public.products (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  slug text UNIQUE NOT NULL,
  description text,
  price_cents integer NOT NULL CHECK (price_cents >= 0),
  currency text DEFAULT 'eur',
  stripe_product_id text,
  stripe_price_id text,
  is_subscription boolean DEFAULT false,
  stock integer DEFAULT 0 CHECK (stock >= 0),
  active boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.customers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text UNIQUE,
  name text,
  phone text,
  address jsonb,
  stripe_customer_id text UNIQUE,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id uuid REFERENCES public.customers(id) ON DELETE SET NULL,
  customer_email text,
  status text NOT NULL DEFAULT 'pending',
  total_cents integer NOT NULL DEFAULT 0,
  currency text DEFAULT 'eur',
  stripe_session_id text UNIQUE,
  stripe_payment_intent_id text,
  stripe_customer_id text,
  shipping_address jsonb,
  created_at timestamptz DEFAULT now(),
  paid_at timestamptz
);

CREATE TABLE IF NOT EXISTS public.order_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES public.products(id),
  quantity integer NOT NULL CHECK (quantity > 0),
  unit_price_cents integer NOT NULL CHECK (unit_price_cents >= 0),
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.webhook_events (
  id text PRIMARY KEY,
  type text,
  status text,
  error text,
  created_at timestamptz DEFAULT now(),
  processed_at timestamptz
);

CREATE TABLE IF NOT EXISTS public.inventory_movements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid REFERENCES public.products(id),
  order_id uuid REFERENCES public.orders(id),
  change integer NOT NULL,
  reason text,
  created_at timestamptz DEFAULT now()
);

-- =============================================
-- Triggers
-- =============================================
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS set_products_updated_at ON public.products;
CREATE TRIGGER set_products_updated_at
BEFORE UPDATE ON public.products
FOR EACH ROW
EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS set_customers_updated_at ON public.customers;
CREATE TRIGGER set_customers_updated_at
BEFORE UPDATE ON public.customers
FOR EACH ROW
EXECUTE FUNCTION public.set_updated_at();

-- =============================================
-- Indexes
-- =============================================
CREATE INDEX IF NOT EXISTS orders_stripe_session_id_idx ON public.orders(stripe_session_id);
CREATE INDEX IF NOT EXISTS orders_status_idx ON public.orders(status);
CREATE INDEX IF NOT EXISTS order_items_order_id_idx ON public.order_items(order_id);
CREATE INDEX IF NOT EXISTS products_active_idx ON public.products(active);
CREATE INDEX IF NOT EXISTS products_slug_idx ON public.products(slug);

-- =============================================
-- Stock decrement function
-- =============================================
CREATE OR REPLACE FUNCTION public.decrement_stock_for_order(order_id uuid)
RETURNS TABLE(product_id uuid, change integer) AS $$
DECLARE
  rec record;
BEGIN
  FOR rec IN
    SELECT product_id, SUM(quantity) AS qty
    FROM public.order_items
    WHERE order_id = decrement_stock_for_order.order_id
    GROUP BY product_id
  LOOP
    UPDATE public.products
    SET stock = stock - rec.qty
    WHERE id = rec.product_id
      AND stock - rec.qty >= 0;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Insufficient stock for product %', rec.product_id;
    END IF;

    INSERT INTO public.inventory_movements (product_id, order_id, change, reason)
    VALUES (rec.product_id, decrement_stock_for_order.order_id, -rec.qty, 'order_paid');

    RETURN QUERY SELECT rec.product_id, -rec.qty;
  END LOOP;
END;
$$ LANGUAGE plpgsql;

-- =============================================
-- Seed data (idempotent via ON CONFLICT slug)
-- =============================================
INSERT INTO public.products (name, slug, description, price_cents, currency, stock, active, is_subscription)
VALUES
  ('Encens rituel', 'encens-rituel', 'Encens artisanal pour rituels.', 1200, 'eur', 10, true, false),
  ('Abonnement 7€/mois', 'abonnement-7-eur', 'Abonnement mensuel de rituels.', 700, 'eur', 9999, true, true)
ON CONFLICT (slug) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  price_cents = EXCLUDED.price_cents,
  currency = EXCLUDED.currency,
  stock = EXCLUDED.stock,
  active = EXCLUDED.active,
  is_subscription = EXCLUDED.is_subscription,
  updated_at = now();


-- ============================================================
-- MIGRATION : 20251221_stripe.sql
-- ============================================================
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



-- ============================================================
-- MIGRATION : 20251222_create_products.sql
-- ============================================================
-- Deprecated: replaced by 0001_bootstrap.sql
-- Keeping this migration as a harmless no-op preserves history/order.
SELECT 1;


-- ============================================================
-- MIGRATION : 20251223_add_user_id.sql
-- ============================================================
-- Add user_id column to orders table
-- This allows linking orders to authenticated users

ALTER TABLE public.orders 
  ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL;

-- Add index for efficient user order lookups
CREATE INDEX IF NOT EXISTS orders_user_id_idx ON public.orders(user_id);

-- Backfill comment
COMMENT ON COLUMN public.orders.user_id IS 'Links order to authenticated user (nullable for guest checkouts)';


-- ============================================================
-- MIGRATION : 001_stripe_supabase.sql
-- ============================================================
-- Run manually in Supabase SQL editor (not auto-applied)
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- 1) Customers (must exist before orders.customer_id FK)
CREATE TABLE IF NOT EXISTS customers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  stripe_customer_id text UNIQUE,
  email text,
  name text,
  phone text,
  address jsonb,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- 2) Subscriptions
CREATE TABLE IF NOT EXISTS subscriptions (
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
CREATE INDEX IF NOT EXISTS subscriptions_customer_idx ON subscriptions(stripe_customer_id);

-- 3) Orders enrichments
ALTER TABLE orders ADD COLUMN IF NOT EXISTS stripe_session_id text;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS stripe_payment_intent_id text;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS paid_at timestamptz;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS currency text;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS stripe_customer_id text;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS customer_id uuid;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS customer_email text;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS shipping_address jsonb;

-- Ensure defaults (if columns already existed without defaults)
ALTER TABLE orders ALTER COLUMN currency SET DEFAULT 'eur';
ALTER TABLE orders ALTER COLUMN status SET DEFAULT 'pending';

-- Constraints / indexes (idempotent-ish)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'orders_stripe_session_id_key'
  ) THEN
    ALTER TABLE orders ADD CONSTRAINT orders_stripe_session_id_key UNIQUE (stripe_session_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'orders_customer_id_fkey'
  ) THEN
    ALTER TABLE orders
      ADD CONSTRAINT orders_customer_id_fkey
      FOREIGN KEY (customer_id) REFERENCES customers(id);
  END IF;
END$$;

CREATE INDEX IF NOT EXISTS orders_stripe_payment_intent_id_idx ON orders(stripe_payment_intent_id);
CREATE INDEX IF NOT EXISTS orders_stripe_customer_id_idx ON orders(stripe_customer_id);
CREATE INDEX IF NOT EXISTS orders_customer_id_idx ON orders(customer_id);

-- 4) Products stock
ALTER TABLE products ADD COLUMN IF NOT EXISTS stock integer DEFAULT 0;
ALTER TABLE products ADD COLUMN IF NOT EXISTS stock_reserved integer DEFAULT 0;

-- 5) Webhook idempotence
CREATE TABLE IF NOT EXISTS webhook_events (
  id text PRIMARY KEY,
  type text,
  status text,
  error text,
  created_at timestamptz DEFAULT now(),
  processed_at timestamptz
);
CREATE INDEX IF NOT EXISTS webhook_events_status_idx ON webhook_events(status);

-- 6) Inventory audit
CREATE TABLE IF NOT EXISTS inventory_movements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid REFERENCES products(id),
  order_id uuid REFERENCES orders(id),
  change integer NOT NULL,
  reason text,
  created_at timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS inventory_movements_product_idx ON inventory_movements(product_id);

-- 7) Print queue
CREATE TABLE IF NOT EXISTS print_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid REFERENCES orders(id),
  payload jsonb,
  status text DEFAULT 'queued',
  created_at timestamptz DEFAULT now(),
  processed_at timestamptz
);
CREATE INDEX IF NOT EXISTS print_jobs_status_idx ON print_jobs(status);

-- 8) Outbox / integrations
CREATE TABLE IF NOT EXISTS integration_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  type text,
  payload jsonb,
  status text DEFAULT 'pending',
  attempts integer DEFAULT 0,
  last_error text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS integration_events_status_idx ON integration_events(status);

-- 9) Stock decrement per order (atomic guard against negatives)
CREATE OR REPLACE FUNCTION decrement_stock_for_order(order_id uuid)
RETURNS TABLE(product_id uuid, change integer) AS $$
DECLARE
  rec record;
BEGIN
  FOR rec IN
    SELECT product_id, SUM(quantity) AS qty
    FROM order_items
    WHERE order_id = decrement_stock_for_order.order_id
    GROUP BY product_id
  LOOP
    UPDATE products
    SET stock = stock - rec.qty
    WHERE id = rec.product_id
      AND stock - rec.qty >= 0;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Insufficient stock for product %', rec.product_id;
    END IF;

    INSERT INTO inventory_movements (product_id, order_id, change, reason)
    VALUES (rec.product_id, decrement_stock_for_order.order_id, -rec.qty, 'order_paid');

    RETURN QUERY SELECT rec.product_id, -rec.qty;
  END LOOP;
END;
$$ LANGUAGE plpgsql;


-- ============================================================
-- MIGRATION : 002_orders_stripe_hardening.sql
-- ============================================================
-- Migration: ensure stripe payment intent storage is present and indexed
-- Safe to run multiple times

ALTER TABLE orders ADD COLUMN IF NOT EXISTS stripe_payment_intent_id text;

CREATE UNIQUE INDEX IF NOT EXISTS orders_stripe_payment_intent_id_uniq
  ON orders(stripe_payment_intent_id)
  WHERE stripe_payment_intent_id IS NOT NULL;


-- ============================================================
-- MIGRATION : 003_orders_updated_at.sql
-- ============================================================
-- Ensure updated_at column and trigger on orders (idempotent)

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

CREATE OR REPLACE FUNCTION public.set_orders_updated_at()
RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgname = 'trg_orders_updated_at'
      AND tgrelid = 'public.orders'::regclass
  ) THEN
    CREATE TRIGGER trg_orders_updated_at
    BEFORE UPDATE ON public.orders
    FOR EACH ROW EXECUTE FUNCTION public.set_orders_updated_at();
  END IF;
END;
$$;


-- ============================================================
-- MIGRATION : 004_orders_receipt_email.sql
-- ============================================================
-- Ensure orders table has required columns for success flow and email idempotence
ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS amount_total integer,
  ADD COLUMN IF NOT EXISTS currency text,
  ADD COLUMN IF NOT EXISTS customer_email text,
  ADD COLUMN IF NOT EXISTS receipt_email_sent_at timestamptz,
  ADD COLUMN IF NOT EXISTS receipt_email_status text,
  ADD COLUMN IF NOT EXISTS last_error_code text,
  ADD COLUMN IF NOT EXISTS last_error_at timestamptz;

-- Unique constraint to avoid duplicate sessions
CREATE UNIQUE INDEX IF NOT EXISTS orders_stripe_session_id_key ON orders (stripe_session_id);
CREATE INDEX IF NOT EXISTS orders_status_idx ON orders (status);
CREATE INDEX IF NOT EXISTS orders_stripe_payment_intent_id_idx ON orders (stripe_payment_intent_id);


-- ============================================================
-- MIGRATION : 005_orders_customer_email_amount_currency.sql
-- ============================================================
-- Add customer_email / amount_total / currency to orders if missing
ALTER TABLE IF EXISTS orders
  ADD COLUMN IF NOT EXISTS customer_email text,
  ADD COLUMN IF NOT EXISTS amount_total integer,
  ADD COLUMN IF NOT EXISTS currency text;

-- Keep lookups by session fast
CREATE INDEX IF NOT EXISTS orders_stripe_session_id_idx ON orders(stripe_session_id);

-- Optional backfill: copy total_cents into amount_total when empty
UPDATE orders
SET amount_total = total_cents
WHERE amount_total IS NULL AND total_cents IS NOT NULL;


-- ============================================================
-- MIGRATION : 20260323_upsert_frontend_products.sql
-- ============================================================
-- ============================================================
-- Migration : Upsert des produits utilisés par le frontend
-- Date      : 2026-03-23
-- Contexte  : Le front utilise désormais les slugs khamare,
--             hibiscus-blanc et hibiscus-rouge. Cette migration
--             insère ces produits s'ils n'existent pas encore,
--             ou met à jour leurs données si le slug est déjà
--             présent (UPSERT ON CONFLICT slug).
--
-- ⚠️  AVANT LA MISE EN PRODUCTION :
--     Remplacer les valeurs stripe_price_id et stripe_product_id
--     par les identifiants réels obtenus depuis le dashboard
--     Stripe (https://dashboard.stripe.com/products).
--     Les placeholders utilisés ici commencent par "price_REPLACE"
--     et "prod_REPLACE" — une recherche sur ce motif vous permettra
--     de les identifier facilement.
-- ============================================================

INSERT INTO public.products (
  name,
  slug,
  description,
  price_cents,
  currency,
  stripe_product_id,
  stripe_price_id,
  is_subscription,
  stock,
  active
)
VALUES
  (
    'Khamaré (Racine de Vétiver)',
    'khamare',
    'Plante traditionnelle purifiante et apaisante. Utilisée depuis des générations pour le bien-être féminin. Sachet artisanal récolté à la main en Afrique de l''Ouest.',
    1200,       -- 12,00 €
    'eur',
    'prod_khamare_placeholder',       -- ⚠️ Remplacer par l'ID Stripe réel
    'price_1TIkNHDGvLI4KtF3oO4naAkq',      -- ⚠️ Remplacer par l'ID Stripe réel
    false,
    100,
    true
  ),
  (
    'Fleurs d''Hibiscus Blanc',
    'hibiscus-blanc',
    'Sachet de 100g. Doux et réconfortant. Riche en antioxydants. Idéal en infusion chaude ou froide.',
    600,        -- 6,00 €
    'eur',
    'prod_hibiscus_blanc_placeholder',  -- ⚠️ Remplacer par l'ID Stripe réel
    'price_1TIkNHDGvLI4KtF3Z9pddmCx', -- ⚠️ Remplacer par l'ID Stripe réel
    false,
    100,
    true
  ),
  (
    'Fleurs d''Hibiscus Rouge',
    'hibiscus-rouge',
    'Sachet de 100g. Riche en antioxydants. Saveur acidulée et naturelle.',
    600,        -- 6,00 €
    'eur',
    'prod_hibiscus_rouge_placeholder',  -- ⚠️ Remplacer par l'ID Stripe réel
    'price_1TIkNIDGvLI4KtF3SvDcAvIU', -- ⚠️ Remplacer par l'ID Stripe réel
    false,
    100,
    true
  )
ON CONFLICT (slug) DO UPDATE SET
  name              = EXCLUDED.name,
  description       = EXCLUDED.description,
  price_cents       = EXCLUDED.price_cents,
  currency          = EXCLUDED.currency,
  stripe_product_id = EXCLUDED.stripe_product_id,
  stripe_price_id   = EXCLUDED.stripe_price_id,
  is_subscription   = EXCLUDED.is_subscription,
  stock             = EXCLUDED.stock,
  active            = EXCLUDED.active,
  updated_at        = now();


