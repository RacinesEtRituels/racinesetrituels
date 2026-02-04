#!/usr/bin/env bash
set -euo pipefail
ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT_DIR"

export NODE_ENV=${NODE_ENV:-development}

echo "[SYNC] running dev-sync-stripe-products (NODE_ENV=$NODE_ENV)"
node "$ROOT_DIR/scripts/dev-sync-stripe-products.mjs"
