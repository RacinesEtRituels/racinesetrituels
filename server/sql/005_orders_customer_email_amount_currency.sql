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
