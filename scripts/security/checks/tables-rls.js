import { query } from '../db.js';
import { pass, fail, warn } from '../reporter.js';
import { config } from '../config.js';

// Check 1 — Every public table must have RLS enabled.
// Supabase's PostgREST exposes all tables; without RLS, anon can
// read/write every row regardless of any other protection.

export async function checkTablesRls() {
  const rows = await query(`
    SELECT
      c.relname          AS table_name,
      c.relrowsecurity   AS rls_enabled,
      c.relforcerowsecurity AS rls_forced
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = $1
      AND c.relkind = 'r'
    ORDER BY c.relname
  `, [config.schema]);

  if (rows.length === 0) {
    pass('No tables found in public schema');
    return;
  }

  for (const row of rows) {
    const whitelisted = config.rlsWhitelist.includes(row.table_name);

    if (row.rls_enabled) {
      pass(`"${row.table_name}" — RLS ON`);
    } else if (whitelisted) {
      warn(
        `"${row.table_name}" — RLS OFF (whitelisted)`,
        'Document why this table is exempted from RLS.'
      );
    } else {
      fail(
        `"${row.table_name}" — RLS DISABLED`,
        'anon/authenticated can read & write every row. Run: ALTER TABLE public.' +
        row.table_name + ' ENABLE ROW LEVEL SECURITY;'
      );
    }
  }
}
