import { query } from '../db.js';
import { pass, fail, warn, info } from '../reporter.js';
import { config } from '../config.js';

// Check 4 — SECURITY DEFINER functions with public EXECUTE.
//
// A SECURITY DEFINER function runs as its owner, not the caller.
// If the owner is postgres (superuser with BYPASSRLS), the function
// bypasses RLS on every table it touches — even tables with deny-all RLS.
//
// Detection uses has_function_privilege() which captures effective
// access including PUBLIC grant inheritance, unlike routine_privileges
// which only shows explicit named-role grants.

const SAFE_GRANTEES = new Set(['postgres', 'service_role', 'supabase_admin', ...config.approvedFunctionGrantees ?? []]);
const TRIGGER_RETURN = new Set(['trigger', 'event_trigger']);

export async function checkFunctions() {
  const fns = await query(`
    SELECT
      p.oid,
      p.proname                                        AS name,
      pg_get_function_identity_arguments(p.oid)        AS args,
      pg_get_function_result(p.oid)                    AS return_type,
      r.rolname                                        AS owner,
      p.prosecdef                                      AS security_definer,
      p.prokind                                        AS kind,
      r.rolsuper                                       AS owner_is_superuser
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    JOIN pg_roles r ON r.oid = p.proowner
    WHERE n.nspname = $1
      AND p.prokind IN ('f', 'p')   -- functions and procedures only
    ORDER BY p.proname
  `, [config.schema]);

  if (fns.length === 0) {
    pass('No functions found in public schema');
    return;
  }

  for (const fn of fns) {
    const sig        = `${fn.name}(${fn.args})`;
    const isTrigger  = TRIGGER_RETURN.has(fn.return_type);

    // Check effective EXECUTE access for anon and authenticated
    let anonExec = false;
    let authExec = false;

    try {
      const res = await query(`
        SELECT
          has_function_privilege('anon', $1, 'EXECUTE')          AS anon_exec,
          has_function_privilege('authenticated', $1, 'EXECUTE') AS auth_exec
      `, [fn.oid]);
      anonExec = res[0]?.anon_exec ?? false;
      authExec = res[0]?.auth_exec ?? false;
    } catch {
      warn(`Function "${sig}" — could not check effective grants`);
      continue;
    }

    const accessible = anonExec || authExec;
    const grantees   = [anonExec && 'anon', authExec && 'authenticated'].filter(Boolean);
    const label      = `Function "${sig}" (owner: ${fn.owner})`;

    if (!accessible) {
      if (fn.security_definer) {
        pass(`${label} — SECURITY DEFINER, not accessible to anon/authenticated`);
      } else {
        pass(`${label} — not accessible to anon/authenticated`);
      }
      continue;
    }

    // Accessible + SECURITY DEFINER = critical
    if (fn.security_definer) {
      if (fn.owner_is_superuser) {
        fail(
          `${label} — SECURITY DEFINER accessible to [${grantees.join(', ')}]`,
          `Owner is SUPERUSER (BYPASSRLS) → function bypasses ALL RLS policies. ` +
          `Run: REVOKE EXECUTE ON FUNCTION public.${fn.name}(${fn.args}) FROM PUBLIC;`
        );
      } else {
        fail(
          `${label} — SECURITY DEFINER accessible to [${grantees.join(', ')}]`,
          `Function runs as "${fn.owner}" — verify this owner cannot bypass RLS. ` +
          `Consider REVOKE EXECUTE FROM PUBLIC and re-grant to service_role only.`
        );
      }
      continue;
    }

    // Accessible + trigger function (not routable via PostgREST, low risk)
    if (isTrigger) {
      info(
        `${label} — trigger function, EXECUTE granted to [${grantees.join(', ')}]`,
        'Trigger functions cannot be called via PostgREST. REVOKE for hygiene.'
      );
      continue;
    }

    // Accessible + SECURITY INVOKER = warn (RLS applies, but still review)
    warn(
      `${label} — SECURITY INVOKER accessible to [${grantees.join(', ')}]`,
      'Function runs as the caller; RLS applies normally. ' +
      'Verify it does not leak data through aggregation or joins.'
    );
  }
}
