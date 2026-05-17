-- =================================================================
-- Migration : revoke_execute_public_functions
-- Timestamp : 20260517050000
-- Cible     : 7 fonctions public uniquement
-- Objectif  : Révoquer EXECUTE pour anon + authenticated.
--             Deux fonctions SECURITY DEFINER critiques (owner postgres)
--             bypassaient RLS et étaient appelables par anon via RPC.
-- Détail :
--   adjust_product_stock     → SECURITY DEFINER, modifie stock + inventory_moves
--   generate_monthly_shipments → SECURITY DEFINER, insère subscription_shipments
--   checkout_products_resolve  → SECURITY DEFINER, ref table inexistante (dead)
--   decrement_stock_for_order  → SECURITY INVOKER, dead (table inventory_movements)
--   fn_stock_move_on_order_item   → trigger, non appelable RPC (hygiène)
--   fn_stock_move_on_purchase_item → trigger, non appelable RPC (hygiène)
--   update_appointments_updated_at → trigger, non appelable RPC (hygiène)
-- Idempotent : REVOKE est no-op si le privilège n'existe pas.
-- NE PAS TOUCHER : tables, vues, policies RLS, définitions des fonctions.
-- =================================================================

-- CRITIQUE : SECURITY DEFINER owned postgres, bypass RLS total
REVOKE EXECUTE ON FUNCTION public.adjust_product_stock(uuid, numeric, text, text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.adjust_product_stock(uuid, numeric, text, text) FROM authenticated;

REVOKE EXECUTE ON FUNCTION public.generate_monthly_shipments(date) FROM anon;
REVOKE EXECUTE ON FUNCTION public.generate_monthly_shipments(date) FROM authenticated;

-- SECURITY DEFINER dead (table produits inexistante)
REVOKE EXECUTE ON FUNCTION public.checkout_products_resolve(jsonb) FROM anon;
REVOKE EXECUTE ON FUNCTION public.checkout_products_resolve(jsonb) FROM authenticated;

-- SECURITY INVOKER dead (table inventory_movements inexistante)
REVOKE EXECUTE ON FUNCTION public.decrement_stock_for_order(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.decrement_stock_for_order(uuid) FROM authenticated;

-- Triggers : non routables via PostgREST, hygiène
REVOKE EXECUTE ON FUNCTION public.fn_stock_move_on_order_item() FROM anon;
REVOKE EXECUTE ON FUNCTION public.fn_stock_move_on_order_item() FROM authenticated;

REVOKE EXECUTE ON FUNCTION public.fn_stock_move_on_purchase_item() FROM anon;
REVOKE EXECUTE ON FUNCTION public.fn_stock_move_on_purchase_item() FROM authenticated;

REVOKE EXECUTE ON FUNCTION public.update_appointments_updated_at() FROM anon;
REVOKE EXECUTE ON FUNCTION public.update_appointments_updated_at() FROM authenticated;
