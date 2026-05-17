-- =================================================================
-- Migration : rls_subscription_shipments_deny_all
-- Timestamp : 20260517020000
-- Cible     : public.subscription_shipments uniquement
-- Objectif  : Activer RLS en mode deny-all implicite.
--             Aucune policy ajoutée → anon et authenticated ne
--             peuvent ni lire ni écrire cette table.
--             service_role bypasse RLS → backend Express non affecté.
-- Contexte  : Aucun frontend ni backend n'utilise cette table.
--             Contient tracking_number et notes → données sensibles.
--             Table préparée pour un futur flux service_role uniquement.
-- FK        : subscription_id → subscriptions.id (sortante uniquement).
-- Idempotent : ALTER TABLE ENABLE ROW LEVEL SECURITY est no-op si
--              RLS est déjà activé.
-- NE PAS TOUCHER : subscriptions, orders, customers, products.
-- =================================================================

ALTER TABLE public.subscription_shipments ENABLE ROW LEVEL SECURITY;
