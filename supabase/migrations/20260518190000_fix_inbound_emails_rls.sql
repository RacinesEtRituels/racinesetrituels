-- =============================================================
-- Fix unsafe RLS policy on public.inbound_emails
--
-- Context: audit detected policy "read_inbound_emails_auth"
--          with USING(true) for authenticated role — every
--          logged-in user could SELECT all inbound emails.
--
-- Fix: drop the permissive policy and return to deny-all.
--      No replacement policy is created here; access to
--      inbound_emails must go through backend/service_role only.
--      A scoped policy (e.g. per user_id) can be added later
--      when a clear business rule is defined.
--
-- service_role bypasses RLS → backend Express unaffected.
-- =============================================================

DROP POLICY IF EXISTS "read_inbound_emails_auth" ON public.inbound_emails;

-- Ensure RLS stays enabled (deny-all with 0 policies).
ALTER TABLE public.inbound_emails ENABLE ROW LEVEL SECURITY;
