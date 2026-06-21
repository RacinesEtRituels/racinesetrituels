-- =================================================================
-- Migration : email_logs
-- Timestamp : 20260621000000
-- Objectif  : Tracer chaque tentative d'envoi email (succès ou erreur)
--             pour audit, debug et affichage dans Pilotage360.
-- Accès     : service_role uniquement (Express backend).
--             RLS activé, aucune policy publique → deny-all implicite
--             pour anon et authenticated.
-- =================================================================

CREATE TABLE IF NOT EXISTS public.email_logs (
  id                   uuid        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  order_id             uuid        REFERENCES public.orders(id)     ON DELETE SET NULL,
  customer_id          uuid        REFERENCES public.customers(id)  ON DELETE SET NULL,
  template             text        NOT NULL,
  recipient            text        NOT NULL,
  provider             text        NOT NULL DEFAULT 'resend',
  provider_message_id  text,
  status               text        NOT NULL
    CONSTRAINT email_logs_status_check
    CHECK (status IN ('sent', 'error', 'skipped')),
  error_message        text,
  metadata             jsonb       NOT NULL DEFAULT '{}'::jsonb,
  created_at           timestamptz NOT NULL DEFAULT now()
);

-- Index pour filtrage par commande, client, template et date
CREATE INDEX IF NOT EXISTS email_logs_order_id_idx    ON public.email_logs (order_id);
CREATE INDEX IF NOT EXISTS email_logs_customer_id_idx ON public.email_logs (customer_id);
CREATE INDEX IF NOT EXISTS email_logs_template_idx    ON public.email_logs (template);
CREATE INDEX IF NOT EXISTS email_logs_created_at_idx  ON public.email_logs (created_at DESC);

-- RLS : activé, aucune policy → deny-all implicite pour le rôle public.
-- service_role bypasse RLS → le backend Express peut lire/écrire sans restriction.
ALTER TABLE public.email_logs ENABLE ROW LEVEL SECURITY;
