#!/bin/bash
set -e

# ============================================================
# Generate Supabase TypeScript types
#
# Usage:
#   pnpm db:types           # from local Docker Postgres
#   pnpm db:types --remote  # from remote Supabase project
#
# Prerequisites:
#   Local:  Docker running (pnpm infra:start)
#   Remote: SUPABASE_PROJECT_ID set in tools/dev.secret.sh
# ============================================================

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"

if [[ -f "${SCRIPT_DIR}/dev.secret.sh" ]]; then
  source "${SCRIPT_DIR}/dev.secret.sh"
fi

OUTPUT_FILE="${PROJECT_ROOT}/packages/contracts/src/database.types.ts"
MODE="${1:---local}"

if [ "$MODE" = "--remote" ]; then
  if [ -z "${SUPABASE_PROJECT_ID:-}" ]; then
    echo "✗ SUPABASE_PROJECT_ID is not set."
    echo "  Set it in tools/dev.secret.sh"
    exit 1
  fi

  echo "→ Ensuring Supabase login..."
  pnpm dlx supabase login

  echo "→ Generating types from remote project ${SUPABASE_PROJECT_ID}..."
  pnpm dlx supabase gen types typescript --project-id "$SUPABASE_PROJECT_ID" > "$OUTPUT_FILE"
else
  echo "→ Generating types from local Postgres..."
  pnpm dlx supabase gen types typescript --db-url "postgresql://supabase_admin:${POSTGRES_PASSWORD:-postgres}@localhost:5432/postgres" > "$OUTPUT_FILE"
fi

if [ ! -s "$OUTPUT_FILE" ]; then
  echo "✗ Generation failed. The output file is empty."
  if [ "$MODE" = "--remote" ]; then
    echo "  Check your Supabase project ID and access token."
  else
    echo "  Is Docker running? Run: pnpm infra:start"
  fi
  exit 1
fi

echo "✓ Types generated → ${OUTPUT_FILE}"
echo "  Run 'pnpm build' to verify type compatibility."
