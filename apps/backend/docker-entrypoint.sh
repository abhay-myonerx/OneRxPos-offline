#!/bin/sh
# ─────────────────────────────────────────────────────────────────────────────
# RX POS v2 — Backend container startup script
#
# Runs every time the backend container starts. It is safe to run repeatedly:
#   1. Applies any pending database migrations (idempotent).
#   2. Optionally seeds demo data — ONLY when RUN_SEED=true. Production
#      installs leave this off and create the first business through the
#      first-run setup wizard instead.
#   3. Starts the API server.
#
# docker-compose already waits for PostgreSQL and Redis to be healthy before
# this script runs, so the database is guaranteed to be reachable here.
# ─────────────────────────────────────────────────────────────────────────────

set -e

echo "▶ RX POS backend — applying database migrations..."
npx prisma migrate deploy

if [ "$RUN_SEED" = "true" ]; then
  echo "▶ RUN_SEED=true — seeding demo data (evaluation mode)..."
  npm run db:seed || echo "⚠ Seed skipped (data may already exist) — continuing."
else
  echo "▶ RUN_SEED is not 'true' — skipping demo seed. Use the setup wizard to create your first business."
fi

echo "▶ Starting RX POS API server..."
exec node dist/server.js
