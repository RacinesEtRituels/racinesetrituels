import { query } from '../db.js';
import { pass, fail, warn } from '../reporter.js';
import { config } from '../config.js';

// Check 5 — Table-level grants to anon/authenticated.
//
// Supabase auto-grants ALL to anon/authenticated when tables are
// created. With RLS deny-all active, these grants are harmless — RLS
// intercepts before any data is returned. But without RLS, they are
// the direct exposure vector.
//
// This check cross-references grants with RLS state to report real
// risk rather than flagging every Supabase default grant.

const WRITE_PRIVS = new Set(['INSERT', 'UPDATE', 'DELETE', 'TRUNCATE']);

export async function checkGrants() {
  // Get all grants to public roles
  const grants = await query(`
    SELECT
      grantee,
      table_name,
      array_agg(privilege_type ORDER BY privilege_type) AS privileges
    FROM information_schema.role_table_grants
    WHERE table_schema = $1
      AND grantee = ANY($2::text[])
    GROUP BY grantee, table_name
    ORDER BY table_name, grantee
  `, [config.schema, config.publicRoles]);

  // RLS state + policy count for each table
  const rlsRows = await query(`
    SELECT
      c.relname AS table_name,
      c.relrowsecurity AS rls_on,
      (
        SELECT count(*)
        FROM pg_policies p
        WHERE p.schemaname = $1 AND p.tablename = c.relname
      ) AS policy_count
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = $1 AND c.relkind = 'r'
  `, [config.schema]);

  const rls = Object.fromEntries(rlsRows.map(r => [
    r.table_name,
    { on: r.rls_on, policies: Number(r.policy_count) },
  ]));

  if (grants.length === 0) {
    pass('No explicit grants to anon/authenticated on any table');
    return;
  }

  // Group by table for a cleaner report
  const byTable = {};
  for (const g of grants) {
    if (!byTable[g.table_name]) byTable[g.table_name] = {};
    byTable[g.table_name][g.grantee] = g.privileges;
  }

  for (const [table, roleGrants] of Object.entries(byTable)) {
    const state    = rls[table] ?? { on: false, policies: 0 };
    const isSens   = config.sensitiveTables.includes(table);

    for (const [grantee, rawPrivs] of Object.entries(roleGrants)) {
      // pg returns array_agg as a JS array, but falls back to a "{A,B}" string in some contexts
      const privs  = Array.isArray(rawPrivs)
        ? rawPrivs
        : String(rawPrivs).replace(/[{}]/g, '').split(',').filter(Boolean);
      const writes   = privs.filter(p => WRITE_PRIVS.has(p));
      const hasWrite = writes.length > 0;
      const privStr  = privs.join(', ');

      if (!state.on) {
        // RLS OFF → any grant is a real exposure
        fail(
          `"${table}" grants [${privStr}] to "${grantee}" — RLS DISABLED`,
          'Grant is unprotected. Enable RLS immediately.'
        );
        continue;
      }

      if (state.on && state.policies === 0) {
        // RLS ON, deny-all (0 policies) → writes blocked, SELECT returns []
        // This is the expected Supabase pattern; report as pass
        if (hasWrite) {
          pass(
            `"${table}" grants [${privStr}] to "${grantee}" — blocked by deny-all RLS (0 policies)`
          );
        } else {
          pass(
            `"${table}" SELECT grant to "${grantee}" — deny-all RLS returns []`
          );
        }
        continue;
      }

      // RLS ON with policies
      if (hasWrite && isSens) {
        warn(
          `Sensitive table "${table}" grants writes [${writes.join(', ')}] to "${grantee}"`,
          `RLS has ${state.policies} policy(ies). Verify no INSERT/UPDATE/DELETE policy exists for ${grantee}.`
        );
      } else {
        pass(
          `"${table}" grants [${privStr}] to "${grantee}" — protected by ${state.policies} RLS policy(ies)`
        );
      }
    }
  }
}
