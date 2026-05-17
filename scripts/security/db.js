import { config as dotenvConfig } from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';
import pg from 'pg';

// Load .env.local from project root for local dev.
// Silent if absent — CI/CD injects SUPABASE_DB_URL via environment secrets directly.
// Does NOT override variables already set in the environment (safe for CI).
const __dirname = dirname(fileURLToPath(import.meta.url));
dotenvConfig({ path: resolve(__dirname, '../../.env.local') });

const { Pool } = pg;

let pool = null;

export function getPool() {
  if (pool) return pool;

  const url = process.env.SUPABASE_DB_URL;
  if (!url) {
    throw new Error(
      'Missing SUPABASE_DB_URL.\n' +
      'Format: postgresql://postgres:[PASSWORD]@db.[PROJECT-REF].supabase.co:5432/postgres\n' +
      'Find it in: Supabase Dashboard → Settings → Database → Connection string (URI)'
    );
  }

  pool = new Pool({
    connectionString: url,
    ssl: url.includes('localhost') || url.includes('127.0.0.1')
      ? false
      : { rejectUnauthorized: false },
    max: 3,
    idleTimeoutMillis: 10_000,
    connectionTimeoutMillis: 15_000,
  });

  pool.on('error', (err) => {
    console.error('pg pool error:', err.message);
  });

  return pool;
}

export async function query(sql, params = []) {
  const client = await getPool().connect();
  try {
    const result = await client.query(sql, params);
    return result.rows;
  } finally {
    client.release();
  }
}

export async function closePool() {
  if (pool) {
    await pool.end();
    pool = null;
  }
}
