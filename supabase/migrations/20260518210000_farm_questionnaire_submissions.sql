-- =============================================================
-- Table: farm_questionnaire_submissions
--
-- Centralise toutes les soumissions du site La Ferme des Mini-Pousses :
--   - Demandes de réservation (groupes, écoles, associations)
--   - Messages de contact
--   - Offres de dons matériels
--
-- Accès : service_role uniquement (route API Astro côté Vercel).
-- RLS deny-all : aucun accès direct depuis le navigateur.
-- Suivi et traitement via Pilotage360.
-- =============================================================

CREATE TABLE IF NOT EXISTS public.farm_questionnaire_submissions (
  id                 uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at         timestamptz DEFAULT now() NOT NULL,

  -- Origine et type
  source             text        NOT NULL DEFAULT 'site_web',
  request_type       text        NOT NULL
    CONSTRAINT farm_submissions_type_check
    CHECK (request_type IN ('reservation', 'contact', 'don_materiel')),

  -- Coordonnées contact
  contact_name       text        NOT NULL,
  email              text        NOT NULL,
  phone              text,
  organization_name  text,

  -- Réservation
  visit_type         text,
  preferred_date     date,
  headcount_adults   integer     CHECK (headcount_adults IS NULL OR headcount_adults >= 0),
  headcount_children integer     CHECK (headcount_children IS NULL OR headcount_children >= 0),

  -- Don matériel
  material_type      text,
  material_qty       text,
  material_state     text,
  can_deliver        boolean,

  -- Message libre
  message            text,

  -- Workflow Pilotage360
  status             text        NOT NULL DEFAULT 'new'
    CONSTRAINT farm_submissions_status_check
    CHECK (status IN ('new', 'contacted', 'confirmed', 'cancelled', 'done')),
  assigned_to        text,
  activity_id        uuid,
  notes              jsonb,
  raw_payload        jsonb
);

-- Deny-all : lecture et écriture via service_role uniquement
ALTER TABLE public.farm_questionnaire_submissions ENABLE ROW LEVEL SECURITY;

-- Index pour le dashboard Pilotage360
CREATE INDEX IF NOT EXISTS idx_farm_submissions_status_date
  ON public.farm_questionnaire_submissions (status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_farm_submissions_type_date
  ON public.farm_questionnaire_submissions (request_type, created_at DESC);

COMMENT ON TABLE public.farm_questionnaire_submissions IS
  'Soumissions formulaires site La Ferme des Mini-Pousses. Backend service_role uniquement.';
COMMENT ON COLUMN public.farm_questionnaire_submissions.request_type IS
  'reservation | contact | don_materiel';
COMMENT ON COLUMN public.farm_questionnaire_submissions.status IS
  'new | contacted | confirmed | cancelled | done';
