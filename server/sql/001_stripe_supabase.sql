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
