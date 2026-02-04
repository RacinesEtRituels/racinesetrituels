-- Migration: ensure stripe payment intent storage is present and indexed
-- Safe to run multiple times

ALTER TABLE orders ADD COLUMN IF NOT EXISTS stripe_payment_intent_id text;

CREATE UNIQUE INDEX IF NOT EXISTS orders_stripe_payment_intent_id_uniq
  ON orders(stripe_payment_intent_id)
  WHERE stripe_payment_intent_id IS NOT NULL;
