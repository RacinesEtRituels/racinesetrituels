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
