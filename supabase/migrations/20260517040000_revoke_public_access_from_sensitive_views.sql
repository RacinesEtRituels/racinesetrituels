-- =================================================================
-- Migration : revoke_public_access_from_sensitive_views
-- Timestamp : 20260517040000
-- Cible     : 5 vues public uniquement (pas les tables)
-- Objectif  : Révoquer tous les privilèges anon + authenticated
--             sur les vues owned par postgres (superuser).
--             Ces vues bypassent RLS car leur owner a BYPASSRLS.
--             Sans GRANT, PostgREST ne peut plus router les requêtes
--             → permission denied avant même d'atteindre PostgreSQL.
-- Contexte  : Les tables sous-jacentes ont RLS deny-all correctement
--             configuré, mais les vues (owner=postgres) contournent
--             RLS silencieusement. REVOKE est la correction immédiate.
-- Idempotent : REVOKE est no-op si le privilège n'existe pas.
-- NE PAS TOUCHER : tables, policies RLS, owners des vues, définitions.
-- =================================================================

REVOKE ALL PRIVILEGES ON TABLE public.active_subscriptions_current_month FROM anon;
REVOKE ALL PRIVILEGES ON TABLE public.active_subscriptions_current_month FROM authenticated;

REVOKE ALL PRIVILEGES ON TABLE public.v_current_stock FROM anon;
REVOKE ALL PRIVILEGES ON TABLE public.v_current_stock FROM authenticated;

REVOKE ALL PRIVILEGES ON TABLE public.v_gross_margin_monthly FROM anon;
REVOKE ALL PRIVILEGES ON TABLE public.v_gross_margin_monthly FROM authenticated;

REVOKE ALL PRIVILEGES ON TABLE public.v_inbox_unified FROM anon;
REVOKE ALL PRIVILEGES ON TABLE public.v_inbox_unified FROM authenticated;

REVOKE ALL PRIVILEGES ON TABLE public.v_product_avg_cost_ttc FROM anon;
REVOKE ALL PRIVILEGES ON TABLE public.v_product_avg_cost_ttc FROM authenticated;
