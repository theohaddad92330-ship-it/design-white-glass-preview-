#!/usr/bin/env bash
# #3586 — lance le test d'intégration SQL du Drive interne contre un Postgres + pgvector JETABLE.
# Conteneur détruit en sortie, quoi qu'il arrive. Aucune valeur de secret : mot de passe d'essai local.
set -euo pipefail

if ! docker info >/dev/null 2>&1; then
  echo "Docker ne répond pas : test d'intégration SQL non lancé (rien n'est simulé)." >&2
  exit 2
fi

NAME="ik-pgvector-$$"
PORT="${INTERNAL_KNOWLEDGE_TEST_PG_PORT:-54329}"
cleanup() { docker rm -f "$NAME" >/dev/null 2>&1 || true; }
trap cleanup EXIT

docker run -d --name "$NAME" -e POSTGRES_PASSWORD=essai-local -e POSTGRES_DB=essai -p "127.0.0.1:${PORT}:5432" pgvector/pgvector:pg16 >/dev/null
for _ in $(seq 1 60); do
  if docker exec "$NAME" pg_isready -U postgres -d essai >/dev/null 2>&1; then break; fi
  sleep 1
done
sleep 2

cd "$(dirname "$0")/.."
INTERNAL_KNOWLEDGE_TEST_DATABASE_URL="postgres://postgres:essai-local@127.0.0.1:${PORT}/essai" \
  npx jest src/modules/internal-knowledge/internal-knowledge.store.integration.spec.ts --runInBand
