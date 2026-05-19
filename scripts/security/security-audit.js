#!/usr/bin/env node
// =============================================================
// Supabase PostgreSQL Security Audit
// Usage: node scripts/security/security-audit.js
// Env:   SUPABASE_DB_URL (required)
//        SUPABASE_URL    (optional, shown in header)
// Exit:  0 = all pass  |  1 = failures found  |  2 = crash
// =============================================================

import { checkTablesRls }  from './checks/tables-rls.js';
import { checkPolicies }   from './checks/policies.js';
import { checkViews }      from './checks/views.js';
import { checkFunctions }  from './checks/functions.js';
import { checkGrants }     from './checks/grants.js';
import { checkStorage }    from './checks/storage.js';
import { header, section, summary } from './reporter.js';
import { closePool } from './db.js';

async function main() {
  header(process.env.SUPABASE_URL);

  const checks = [
    { label: '1/6 — Tables RLS',               fn: checkTablesRls  },
    { label: '2/6 — RLS Policies',             fn: checkPolicies   },
    { label: '3/6 — Views',                    fn: checkViews      },
    { label: '4/6 — Functions (SEC DEFINER)',  fn: checkFunctions  },
    { label: '5/6 — Grants',                   fn: checkGrants     },
    { label: '6/6 — Storage',                  fn: checkStorage    },
  ];

  let errors = 0;
  for (const check of checks) {
    section(check.label);
    try {
      await check.fn();
    } catch (err) {
      errors++;
      console.error(`\n  ⚡ Check "${check.label}" threw an error:`);
      console.error(`     ${err.message}`);
      if (process.env.DEBUG) console.error(err.stack);
    }
  }

  const { failures } = summary();

  if (errors > 0) {
    console.error(`\n  ⚠️  ${errors} check(s) could not run (see errors above).`);
    if (errors === checks.length) {
      console.error('  ❌  All checks failed — DB connection likely missing or invalid.');
      console.error('      Set SUPABASE_DB_URL in GitHub Secrets → Settings → Secrets and variables → Actions');
      await closePool();
      process.exit(1);
    }
  }

  await closePool();
  process.exit(failures > 0 ? 1 : 0);
}

main().catch(err => {
  console.error('\n  💥 Fatal error:', err.message);
  if (process.env.DEBUG) console.error(err.stack);
  process.exit(2);
});
