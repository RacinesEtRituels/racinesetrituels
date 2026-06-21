-- =================================================================
-- Migration : fix_dangerous_anon_policies
-- Timestamp : 20260621010000
-- Cible     : 7 tables avec policies anon permissives (USING(true))
-- Objectif  : Supprimer les policies anon trop larges détectées
--             lors de l'audit pré-production 2026-06-21.
--
-- CONTEXTE PARTAGÉ :
--   Ces tables appartiennent au schéma Pilotage360 Core (fjfutavsdlnernwtdsfu).
--   Les policies ci-dessous ont été créées postérieurement aux migrations
--   deny-all et contredisent l'intention de sécurité définie dans :
--     - 20260517030000_rls_remaining_public_tables_deny_all.sql
--     - 20260518210000_farm_questionnaire_submissions.sql
--
-- RISQUES DES POLICIES SUPPRIMÉES :
--   emails_entrants — anon peut lire TOUS les emails entrants (PII)
--   farm_questionnaire_submissions — anon peut lire ET ÉCRIRE toutes
--     les soumissions (nom, email, téléphone, message — RGPD critique)
--   ai_agent_runs/ai_agents/automation_workflows/system_events/
--     workflow_runs — données opérationnelles internes Pilotage360
--     exposées à n'importe quel visiteur
--
-- IMPACT :
--   - service_role (backend Express) : non affecté (bypasse RLS)
--   - anon (frontend / public) : accès révoqué
--   - authenticated : non affecté (pas de policies sur ces tables)
--
-- IDEMPOTENT : DROP POLICY IF EXISTS est no-op si la policy est absente.
-- À APPLIQUER : via Supabase Dashboard SQL Editor sur fjfutavsdlnernwtdsfu
--               ou via le pipeline pilotage360/supabase/migrations/.
-- NE PAS EXÉCUTER via supabase migration up (pipeline R&R invalide).
-- =================================================================

-- ---------------------------------------------------------------
-- CRITIQUE : emails_entrants — emails internes lisibles par anon
-- ---------------------------------------------------------------
DROP POLICY IF EXISTS "Allow anon read emails_entrants" ON public.emails_entrants;

-- Ensure deny-all is preserved (idempotent)
ALTER TABLE public.emails_entrants ENABLE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------
-- CRITIQUE : farm_questionnaire_submissions — PII + UPDATE anon
-- ---------------------------------------------------------------
DROP POLICY IF EXISTS "anon_select_farm_submissions" ON public.farm_questionnaire_submissions;
DROP POLICY IF EXISTS "anon_update_farm_submissions" ON public.farm_questionnaire_submissions;

-- Ensure deny-all is preserved (idempotent)
ALTER TABLE public.farm_questionnaire_submissions ENABLE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------
-- MOYEN : tables internes Pilotage360 exposées à anon
-- ---------------------------------------------------------------
DROP POLICY IF EXISTS "anon_select_ai_agent_runs"        ON public.ai_agent_runs;
DROP POLICY IF EXISTS "anon_select_ai_agents"            ON public.ai_agents;
DROP POLICY IF EXISTS "anon_select_automation_workflows" ON public.automation_workflows;
DROP POLICY IF EXISTS "anon_select_system_events"        ON public.system_events;
DROP POLICY IF EXISTS "anon_select_workflow_runs"        ON public.workflow_runs;

-- Ensure RLS stays enabled on all five tables
ALTER TABLE public.ai_agent_runs        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_agents            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.automation_workflows ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.system_events        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workflow_runs        ENABLE ROW LEVEL SECURITY;
