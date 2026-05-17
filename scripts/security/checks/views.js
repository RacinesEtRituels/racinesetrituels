import { query } from '../db.js';
import { pass, fail, warn } from '../reporter.js';
import { config } from '../config.js';

// Check 3 — Views accessible to anon/authenticated.
//
// Key risk: views owned by postgres (superuser) bypass RLS on
// underlying tables. Even if RLS is ON with deny-all on every
// table, a postgres-owned view will still return all rows to anon
// if it has SELECT grant.
//
// Detection uses has_table_privilege() which checks *effective*
// access including PUBLIC grants — more reliable than querying
// information_schema which omits PUBLIC inheritance.

export async function checkViews() {
  const views = await query(`
    SELECT
      v.viewname,
      v.viewowner,
      CASE
        WHEN v.viewowner IN ('postgres', 'supabase_admin') THEN true
        ELSE false
      END AS superuser_owned
    FROM pg_views v
    WHERE v.schemaname = $1
    ORDER BY v.viewname
  `, [config.schema]);

  if (views.length === 0) {
    pass('No views found in public schema');
    return;
  }

  // Check effective access for anon and authenticated via has_table_privilege.
  // This catches both explicit GRANTs and PUBLIC inheritance.
  for (const v of views) {
    const approved = config.approvedPublicViews.includes(v.viewname);

    let anonSelect = false;
    let authSelect = false;

    try {
      const res = await query(`
        SELECT
          has_table_privilege('anon', $1, 'SELECT')          AS anon_select,
          has_table_privilege('authenticated', $1, 'SELECT') AS auth_select
      `, [`${config.schema}.${v.viewname}`]);
      anonSelect = res[0]?.anon_select ?? false;
      authSelect = res[0]?.auth_select ?? false;
    } catch {
      // Role may not exist in local dev; treat as unknown
      warn(
        `View "${v.viewname}" — could not check effective grants`,
        'Ensure anon and authenticated roles exist in this environment.'
      );
      continue;
    }

    const accessible = anonSelect || authSelect;
    const grantees   = [anonSelect && 'anon', authSelect && 'authenticated'].filter(Boolean);

    if (!accessible) {
      pass(`View "${v.viewname}" (owner: ${v.viewowner}) — not accessible to anon/authenticated`);
      continue;
    }

    if (approved) {
      warn(
        `View "${v.viewname}" accessible to [${grantees.join(', ')}] (approved)`,
        `Owner: ${v.viewowner}. Verify underlying table RLS applies correctly.`
      );
      continue;
    }

    if (v.superuser_owned) {
      fail(
        `View "${v.viewname}" (owner: ${v.viewowner}) accessible to [${grantees.join(', ')}]`,
        'postgres-owned views bypass RLS on underlying tables — data exposed regardless of RLS. ' +
        'Run: REVOKE ALL PRIVILEGES ON TABLE public.' + v.viewname + ' FROM anon; (and authenticated)'
      );
    } else {
      warn(
        `View "${v.viewname}" (owner: ${v.viewowner}) accessible to [${grantees.join(', ')}]`,
        'Verify that RLS on underlying tables correctly filters rows for these roles.'
      );
    }
  }
}
