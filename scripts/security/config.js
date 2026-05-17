// =============================================================
// Security Audit — Configuration & Whitelists
// =============================================================
// Edit this file to tune the audit for your project.
// Entries in whitelist arrays suppress FAIL → WARN or silence.
// =============================================================

export const config = {
  // PostgreSQL schema to audit
  schema: 'public',

  // Tables that may legitimately have RLS disabled.
  // Adding a table here downgrades its check from FAIL to WARN.
  // Keep this list empty unless you have a documented reason.
  rlsWhitelist: [],

  // Roles treated as "public" (unauthenticated or low-trust)
  publicRoles: ['anon', 'authenticated'],

  // Tables classified as sensitive.
  // Policies with USING(true)/WITH CHECK(true) on these tables are
  // automatically flagged as FAIL (not just WARN).
  sensitiveTables: [
    'customers',
    'orders',
    'order_items',
    'subscriptions',
    'subscription_shipments',
    'emails_entrants',
    'inbox_messages',
    'inbound_emails',
    'agent_runs',
    'purchases',
    'purchase_items',
    'quotes',
    'suppliers',
  ],

  // Fully-qualified policy names ("tablename.policyname") that are
  // intentionally permissive (USING(true) or WITH CHECK(true)).
  // These are downgraded from FAIL to INFO.
  approvedPermissivePolicies: [
    // example: 'inbound_emails.read_inbound_emails_auth',
  ],

  // Views that may have grants to anon/authenticated intentionally.
  // These are downgraded from FAIL to WARN.
  approvedPublicViews: [],

  // Storage buckets that are intentionally public.
  // Unlisted public buckets are flagged as FAIL.
  approvedPublicBuckets: [
    // example: 'avatars',
  ],

  // Roles whose EXECUTE on SECURITY DEFINER functions is approved.
  // All others produce FAIL.
  // service_role and postgres are always implicitly approved.
  approvedFunctionGrantees: [],
};
