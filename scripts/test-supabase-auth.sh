#!/usr/bin/env bash
set -euo pipefail

export SUPABASE_URL="${SUPABASE_URL:-http://127.0.0.1:54321}"
: "${SUPABASE_ANON_KEY:?SUPABASE_ANON_KEY is required}"

npm run test:supabase-auth
