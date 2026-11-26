#!/bin/bash
set -euo pipefail

# ============================================================
# BellumAI — Reset local database
#
# Usage:
#   pnpm db:reset
#
# Drops and recreates the bellum schema objects, applies all
# migrations, then seeds test data.
# ============================================================

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"

SEED_FILE="${PROJECT_ROOT}/infra/supabase/seed.sql"
CONTAINER="bellum-postgres"
DB_USER="supabase_admin"
DB_NAME="postgres"
DB_PASS="${POSTGRES_PASSWORD:-postgres}"

# Check container is running
if ! docker ps --format '{{.Names}}' | grep -q "$CONTAINER"; then
  echo "✗ Container $CONTAINER not found. Run: pnpm infra:start"
  exit 1
fi

echo "→ Dropping public schema objects..."
docker exec -i -e PGPASSWORD="$DB_PASS" "$CONTAINER" psql -U "$DB_USER" -d "$DB_NAME" -c "
  DROP SCHEMA public CASCADE;
  CREATE SCHEMA public;
  GRANT ALL ON SCHEMA public TO postgres;
  GRANT ALL ON SCHEMA public TO public;
"

# Grant the postgres role BYPASSRLS so the API (which connects as postgres)
# can read every row regardless of RLS — authorization is enforced in the
# NestJS service layer. ALTER ROLE requires a real superuser, so we run it
# here as supabase_admin rather than from a TypeORM migration.
echo "→ Granting BYPASSRLS to postgres role..."
docker exec -i -e PGPASSWORD="$DB_PASS" "$CONTAINER" psql -U "$DB_USER" -d "$DB_NAME" -c "
  ALTER ROLE postgres BYPASSRLS;
"

echo "→ Applying migrations via TypeORM CLI..."
( cd "${PROJECT_ROOT}" && pnpm --filter api migration:run )

if [ -f "$SEED_FILE" ]; then
  echo "→ Seeding test data..."
  docker exec -i -e PGPASSWORD="$DB_PASS" "$CONTAINER" psql -U "$DB_USER" -d "$DB_NAME" < "$SEED_FILE"
fi

echo "✓ Database reset complete"
echo "  Supabase Studio: http://localhost:3001"
echo "  Run 'pnpm db:types' to regenerate types"
