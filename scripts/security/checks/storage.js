import { query } from '../db.js';
import { pass, fail, warn, info } from '../reporter.js';
import { config } from '../config.js';

// Check 6 — Supabase Storage audit.
//
// Storage data lives in the same PostgreSQL instance under the
// `storage` schema. We query it directly via pg instead of the
// Supabase JS client — no extra dependency needed.
//
// Risks:
//   - Public buckets (any file accessible without auth via CDN)
//   - storage.objects / storage.buckets RLS state
//   - Overly permissive storage policies (INSERT/UPDATE for anon)

export async function checkStorage() {
  // Check if storage schema exists (not present in local dev without storage enabled)
  const schemaCheck = await query(`
    SELECT 1 FROM information_schema.schemata WHERE schema_name = 'storage'
  `);

  if (schemaCheck.length === 0) {
    info('Storage schema not found — skipping (enable Supabase Storage to audit)');
    return;
  }

  await checkBuckets();
  await checkStorageRls();
  await checkStoragePolicies();
}

async function checkBuckets() {
  let buckets;
  try {
    buckets = await query(`
      SELECT id, name, public, file_size_limit, allowed_mime_types
      FROM storage.buckets
      ORDER BY name
    `);
  } catch {
    info('Cannot read storage.buckets — insufficient privileges or table missing');
    return;
  }

  if (buckets.length === 0) {
    pass('No storage buckets found');
    return;
  }

  for (const b of buckets) {
    const approved = config.approvedPublicBuckets.includes(b.name);

    if (b.public && !approved) {
      fail(
        `Bucket "${b.name}" is PUBLIC`,
        'Any file in this bucket is accessible without authentication via CDN. ' +
        'Add to approvedPublicBuckets in config.js if intentional, or make it private.'
      );
    } else if (b.public && approved) {
      warn(
        `Bucket "${b.name}" is PUBLIC (approved)`,
        'Confirm files in this bucket contain no sensitive data.'
      );
    } else {
      const limits = [
        b.file_size_limit ? `max ${(b.file_size_limit / 1024 / 1024).toFixed(0)} MB` : 'no size limit',
        b.allowed_mime_types?.length ? b.allowed_mime_types.join(', ') : 'all mime types',
      ].join(' · ');
      pass(`Bucket "${b.name}" — private · ${limits}`);
    }
  }
}

async function checkStorageRls() {
  const tables = await query(`
    SELECT c.relname AS table_name, c.relrowsecurity AS rls_on
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'storage'
      AND c.relkind = 'r'
      AND c.relname IN ('objects', 'buckets')
    ORDER BY c.relname
  `);

  for (const t of tables) {
    if (t.rls_on) {
      pass(`storage.${t.table_name} — RLS enabled`);
    } else {
      fail(
        `storage.${t.table_name} — RLS DISABLED`,
        'Supabase normally enables RLS on storage tables automatically. ' +
        'Check your Supabase version or manual migrations.'
      );
    }
  }
}

async function checkStoragePolicies() {
  const policies = await query(`
    SELECT tablename, policyname, roles, cmd, qual, with_check
    FROM pg_policies
    WHERE schemaname = 'storage'
    ORDER BY tablename, policyname
  `);

  if (policies.length === 0) {
    warn(
      'No storage policies found',
      'Without policies, storage access depends entirely on bucket public flag. ' +
      'Add INSERT/SELECT policies for authenticated uploads if needed.'
    );
    return;
  }

  for (const p of policies) {
    const roles     = Array.isArray(p.roles) ? p.roles.join(', ') : (p.roles ?? 'unknown');
    const hasAnon   = Array.isArray(p.roles) && p.roles.includes('anon');
    const label     = `Storage policy "${p.policyname}" on "${p.tablename}" [${roles}] (${p.cmd})`;

    if (hasAnon && (p.cmd === 'INSERT' || p.cmd === 'UPDATE' || p.cmd === 'ALL')) {
      fail(
        `${label} — anon can WRITE to storage`,
        'Unauthenticated uploads are almost never intentional. ' +
        'Restrict INSERT/UPDATE policies to authenticated or service_role.'
      );
    } else if (p.qual === 'true' && p.cmd !== 'SELECT') {
      warn(
        `${label} — unrestricted write policy (WITH CHECK / USING = true)`,
        'Consider adding a path or owner predicate.'
      );
    } else {
      pass(`${label} — OK`);
    }
  }
}
