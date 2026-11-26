#!/usr/bin/env bash
#
# Provisionne l'espace de DÉMONSTRATION en une commande (mode démo).
#
# Ce que fait le script :
#   1. crée (ou retrouve) le compte démo dans Supabase Auth — email confirmé ;
#   2. appelle l'endpoint interne de seed avec ce compte, en lui demandant de
#      créer le profil au passage (ensureProfile) : rien à faire dans l'app.
#
# À lancer UNE FOIS, après que l'API soit déployée avec le code démo et que
# DEMO_PUBLIC=true soit posé sur Railway. Idempotent : le relancer ne duplique
# rien (compte retrouvé, seed idempotent).
#
# Toutes les valeurs sensibles se passent en variables d'environnement — le
# script n'en écrit aucune sur disque.
#
# Usage :
#   API_URL=https://api.bellum-ai.com \
#   SUPABASE_URL=https://qkpuwkziwnljfwlzyngr.supabase.co \
#   SUPABASE_SERVICE_ROLE_KEY=... \
#   INTERNAL_API_SECRET=... \
#   bash scripts/seed-demo.sh
#
# Variables optionnelles :
#   DEMO_EMAIL     (défaut demo@bellum-ai.com)
#   DEMO_PASSWORD  (défaut : généré ; sans intérêt, l'accès passe par le lien)
#   DEMO_NAME      (défaut « Démo Bellum »)

set -euo pipefail

: "${API_URL:?API_URL manquant (ex. https://api.bellum-ai.com)}"
: "${SUPABASE_URL:?SUPABASE_URL manquant}"
: "${SUPABASE_SERVICE_ROLE_KEY:?SUPABASE_SERVICE_ROLE_KEY manquant}"
: "${INTERNAL_API_SECRET:?INTERNAL_API_SECRET manquant}"

DEMO_EMAIL="${DEMO_EMAIL:-demo@bellum-ai.com}"
DEMO_PASSWORD="${DEMO_PASSWORD:-Demo-$(head -c 12 /dev/urandom | base64 | tr -dc 'A-Za-z0-9')!}"
DEMO_NAME="${DEMO_NAME:-Démo Bellum}"

API_URL="${API_URL%/}"
SUPABASE_URL="${SUPABASE_URL%/}"

echo "→ Compte démo : ${DEMO_EMAIL}"

# --- 1. Créer le compte Supabase Auth (ou le retrouver s'il existe déjà) ---
# L'API admin renvoie 200 + l'utilisateur à la création. Un e-mail déjà pris
# ressort en 422 — on bascule alors sur une recherche par e-mail.
create_body=$(jq -nc --arg e "$DEMO_EMAIL" --arg p "$DEMO_PASSWORD" \
  '{email:$e, password:$p, email_confirm:true}')

create_resp=$(curl -sS -w '\n%{http_code}' \
  -X POST "${SUPABASE_URL}/auth/v1/admin/users" \
  -H "apikey: ${SUPABASE_SERVICE_ROLE_KEY}" \
  -H "Authorization: Bearer ${SUPABASE_SERVICE_ROLE_KEY}" \
  -H "Content-Type: application/json" \
  -d "$create_body")

create_code=$(printf '%s' "$create_resp" | tail -n1)
create_json=$(printf '%s' "$create_resp" | sed '$d')

if [ "$create_code" = "200" ] || [ "$create_code" = "201" ]; then
  user_id=$(printf '%s' "$create_json" | jq -r '.id')
  echo "  compte créé (id=${user_id})"
else
  echo "  compte déjà présent (HTTP ${create_code}) — recherche par e-mail…"
  # `filter` fait un match exact sur l'e-mail (API GoTrue admin).
  list_json=$(curl -sS \
    -G "${SUPABASE_URL}/auth/v1/admin/users" \
    --data-urlencode "filter=email.eq.${DEMO_EMAIL}" \
    -H "apikey: ${SUPABASE_SERVICE_ROLE_KEY}" \
    -H "Authorization: Bearer ${SUPABASE_SERVICE_ROLE_KEY}")
  user_id=$(printf '%s' "$list_json" | jq -r --arg e "$DEMO_EMAIL" \
    '.users[]? | select(.email==$e) | .id' | head -n1)
fi

if [ -z "${user_id:-}" ] || [ "$user_id" = "null" ]; then
  echo "✗ Impossible d'obtenir l'id du compte démo." >&2
  exit 1
fi

# --- 2. Seed de l'espace démo (crée le profil si absent) ---
seed_body=$(jq -nc --arg u "$user_id" --arg n "$DEMO_NAME" \
  '{ownerUserId:$u, name:$n, ensureProfile:true}')

seed_resp=$(curl -sS -w '\n%{http_code}' \
  -X POST "${API_URL}/internal/admin/workspaces/demo" \
  -H "x-internal-secret: ${INTERNAL_API_SECRET}" \
  -H "Content-Type: application/json" \
  -d "$seed_body")

seed_code=$(printf '%s' "$seed_resp" | tail -n1)
seed_json=$(printf '%s' "$seed_resp" | sed '$d')

if [ "$seed_code" != "200" ] && [ "$seed_code" != "201" ]; then
  echo "✗ Le seed a échoué (HTTP ${seed_code}) :" >&2
  printf '%s\n' "$seed_json" >&2
  exit 1
fi

accounts=$(printf '%s' "$seed_json" | jq -r '.accounts')
echo "✓ Espace démo prêt — ${accounts} dossiers d'exemple."
echo
echo "  Lien à envoyer aux prospects :"
echo "    ${DEMO_APP_URL:-https://app.bellum-ai.com}/demo"
