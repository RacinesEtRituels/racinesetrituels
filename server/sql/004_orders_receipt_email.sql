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
