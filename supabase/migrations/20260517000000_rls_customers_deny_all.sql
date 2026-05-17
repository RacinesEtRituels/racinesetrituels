-- =================================================================
-- Migration : rls_customers_deny_all
-- Timestamp : 20260517000000
-- Cible     : public.customers uniquement
-- Objectif  : Activer RLS en mode deny-all implicite.
--             Aucune policy ajoutée → anon et authenticated ne
--             peuvent ni lire ni écrire cette table.
--             service_role bypasse RLS → backend Express non affecté.
-- Contexte  : Aucun frontend ne lit customers valablement.
--             Toutes les opérations passent par Express (service_role).
-- FK enfants : orders, subscriptions, bookings, quotes, appointments,
--              inbox_messages → tous via service_role, non affectés.
-- Idempotent : ALTER TABLE ENABLE ROW LEVEL SECURITY est no-op si
--             RLS est déjà activé.
-- NE PAS TOUCHER : orders, order_items, products, subscriptions.
-- =================================================================

ALTER TABLE public.customers ENABLE ROW LEVEL SECURITY;
