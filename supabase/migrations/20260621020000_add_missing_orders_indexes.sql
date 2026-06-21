-- =================================================================
-- Migration : add_missing_orders_indexes
-- Timestamp : 20260621020000
-- Cible     : public.orders (3 index manquants)
-- Objectif  : Ajouter les index utiles aux lookups Stripe et client
--             effectués par le backend Express en production.
--
-- CONTEXTE :
--   Le backend fait les requêtes suivantes sur orders :
--     .eq("id", orderId)                       → pkey ✅ (existe)
--     .update(...).eq("id", orderId)            → pkey ✅ (existe)
--     .update(...).eq("customer_id", ...)       → index manquant ❌
--     .eq("stripe_customer_id", ...)            → index manquant ❌
--   Le webhook Stripe utilise stripe_payment_intent_id
--   pour déduplication (pas de lookup direct, mais utile au Dashboard).
--
-- IDEMPOTENT : CREATE INDEX IF NOT EXISTS est no-op si l'index existe.
-- Partiel (WHERE NOT NULL) pour les colonnes nullable à faible cardinalité.
-- À APPLIQUER : Supabase Dashboard SQL Editor sur fjfutavsdlnernwtdsfu
--               ou pipeline pilotage360/supabase/migrations/.
-- NE PAS EXÉCUTER via supabase migration up (pipeline R&R invalide).
-- =================================================================

CREATE INDEX IF NOT EXISTS idx_orders_customer_id
  ON public.orders(customer_id)
  WHERE customer_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_orders_stripe_customer_id
  ON public.orders(stripe_customer_id)
  WHERE stripe_customer_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_orders_stripe_payment_intent_id
  ON public.orders(stripe_payment_intent_id)
  WHERE stripe_payment_intent_id IS NOT NULL;
