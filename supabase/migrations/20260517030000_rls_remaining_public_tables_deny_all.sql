-- =================================================================
-- Migration : rls_remaining_public_tables_deny_all
-- Timestamp : 20260517030000
-- Cible     : 16 tables public restantes (voir liste ci-dessous)
-- Objectif  : Activer RLS en mode deny-all implicite.
--             Aucune policy ajoutée → anon et authenticated ne
--             peuvent ni lire ni écrire ces tables.
--             service_role bypasse RLS → backends non affectés.
-- Contexte  : Tables Pilotage360 dans Supabase partagé.
--             Aucun frontend racinesetrituels ne les utilise.
--             Toutes les opérations passent par service_role.
-- Idempotent : ALTER TABLE ENABLE ROW LEVEL SECURITY est no-op si
--              RLS est déjà activé.
-- NE PAS TOUCHER : products, orders, order_items, customers,
--                  subscriptions, subscription_shipments
--                  (déjà sécurisées avec policies ou deny-all).
-- =================================================================

-- Groupe 1 : données personnelles (priorité haute)
ALTER TABLE public.emails_entrants   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inbox_messages    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agent_runs        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.appointments      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bookings          ENABLE ROW LEVEL SECURITY;

-- Groupe 2 : données financières / opérationnelles
ALTER TABLE public.purchases         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.purchase_items    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.quotes            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.suppliers         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory_moves   ENABLE ROW LEVEL SECURITY;

-- Groupe 3 : données opérationnelles internes
ALTER TABLE public.tasks             ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.activity_log      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.events            ENABLE ROW LEVEL SECURITY;

-- Groupe 4 : tables de référence Pilotage360
ALTER TABLE public.activities        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agenda_activities ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.channels          ENABLE ROW LEVEL SECURITY;
