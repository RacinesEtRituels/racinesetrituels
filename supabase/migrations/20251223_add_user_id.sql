-- Add user_id column to orders table
-- This allows linking orders to authenticated users

ALTER TABLE public.orders 
  ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL;

-- Add index for efficient user order lookups
CREATE INDEX IF NOT EXISTS orders_user_id_idx ON public.orders(user_id);

-- Backfill comment
COMMENT ON COLUMN public.orders.user_id IS 'Links order to authenticated user (nullable for guest checkouts)';
