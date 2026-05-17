-- =================================================================
-- Migration : revoke_execute_from_public_functions
-- Timestamp : 20260517060000
-- Contexte  : La migration 20260517050000 a révoqué les grants
--             explicites à anon/authenticated, mais PostgreSQL accorde
--             EXECUTE à PUBLIC par défaut → anon hérite de PUBLIC
--             et contourne le REVOKE. Tests confirmés : anon pouvait
--             encore appeler adjust_product_stock et
--             generate_monthly_shipments après la migration 050000.
-- Objectif  : REVOKE EXECUTE FROM PUBLIC sur les 7 fonctions, puis
--             re-GRANT à service_role uniquement pour les fonctions
--             que le backend Pilotage360 appelle légitimement.
--             postgres (superuser) bypasse toujours les GRANTs.
-- Idempotent : REVOKE et GRANT sont no-op si le privilège est déjà
--              dans l'état voulu.
-- NE PAS TOUCHER : tables, vues, policies RLS, définitions fonctions.
-- =================================================================

-- ---------------------------------------------------------------
-- Étape 1 : REVOKE FROM PUBLIC sur les 7 fonctions
-- ---------------------------------------------------------------

-- SECURITY DEFINER critiques (bypassaient RLS)
REVOKE EXECUTE ON FUNCTION public.adjust_product_stock(uuid, numeric, text, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.generate_monthly_shipments(date) FROM PUBLIC;

-- SECURITY DEFINER dead (table produits inexistante)
REVOKE EXECUTE ON FUNCTION public.checkout_products_resolve(jsonb) FROM PUBLIC;

-- SECURITY INVOKER dead (table inventory_movements inexistante)
REVOKE EXECUTE ON FUNCTION public.decrement_stock_for_order(uuid) FROM PUBLIC;

-- Triggers : non routables via PostgREST, hygiène
REVOKE EXECUTE ON FUNCTION public.fn_stock_move_on_order_item() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.fn_stock_move_on_purchase_item() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.update_appointments_updated_at() FROM PUBLIC;

-- ---------------------------------------------------------------
-- Étape 2 : re-GRANT à service_role uniquement
-- pour les fonctions appelées par le backend Pilotage360
-- (postgres/superuser bypasse les GRANTs, pas besoin de re-grant)
-- ---------------------------------------------------------------
GRANT EXECUTE ON FUNCTION public.adjust_product_stock(uuid, numeric, text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.generate_monthly_shipments(date) TO service_role;
