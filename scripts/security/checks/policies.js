import { query } from '../db.js';
import { pass, fail, warn, info } from '../reporter.js';
import { config } from '../config.js';

// Check 2 — Audit RLS policies for over-permissive expressions.
//
// Danger patterns:
//   USING(true)           → all rows visible to grantee, no filtering
//   WITH CHECK(true)      → any row can be inserted/updated
//   cmd = ALL             → one policy grants read + write (easy to miss)
//   anon on sensitive     → public access to sensitive data

export async function checkPolicies() {
  const policies = await query(`
    SELECT
      tablename,
      policyname,
      roles,
      cmd,
      qual        AS using_expr,
      with_check  AS check_expr
    FROM pg_policies
    WHERE schemaname = $1
    ORDER BY tablename, policyname
  `, [config.schema]);

  if (policies.length === 0) {
    info('No RLS policies found in public schema');
    return;
  }

  for (const p of policies) {
    const key        = `${p.tablename}.${p.policyname}`;
    const isSens     = config.sensitiveTables.includes(p.tablename);
    const isApproved = config.approvedPermissivePolicies.includes(key);
    const roles      = Array.isArray(p.roles) ? p.roles.join(', ') : (p.roles ?? 'unknown');
    const hasAnon    = Array.isArray(p.roles) && (p.roles.includes('anon') || p.roles.includes('public'));
    const label      = `Policy "${p.policyname}" on "${p.tablename}" [${roles}] (${p.cmd})`;

    if (isApproved) {
      info(`${label} — approved permissive policy (whitelisted)`);
      continue;
    }

    // USING(true) on sensitive table → FAIL
    if (p.using_expr === 'true' && isSens) {
      fail(
        `${label} — USING(true) on SENSITIVE table`,
        'All rows exposed to listed roles with no predicate filtering.'
      );
      continue;
    }

    // WITH CHECK(true) on sensitive table → FAIL
    if (p.check_expr === 'true' && isSens) {
      fail(
        `${label} — WITH CHECK(true) on SENSITIVE table`,
        'Any row can be inserted/updated by listed roles without restriction.'
      );
      continue;
    }

    // USING(true) or WITH CHECK(true) on non-sensitive → WARN
    if (p.using_expr === 'true' || p.check_expr === 'true') {
      warn(
        `${label} — permissive expression (true) on non-sensitive table`,
        'Consider adding a predicate if this is not intentionally public.'
      );
      continue;
    }

    // cmd = ALL on sensitive table → WARN (hard to audit split permissions)
    if (p.cmd === 'ALL' && isSens) {
      warn(
        `${label} — cmd=ALL on SENSITIVE table`,
        'Consider splitting into explicit SELECT / INSERT / UPDATE / DELETE policies.'
      );
      continue;
    }

    // anon on sensitive table → WARN (even with predicate)
    if (hasAnon && isSens) {
      warn(
        `${label} — anon has access to SENSITIVE table`,
        'Verify this is intentional and the predicate sufficiently restricts rows.'
      );
      continue;
    }

    pass(`${label} — OK`);
  }
}
