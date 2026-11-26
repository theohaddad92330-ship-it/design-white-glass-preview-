#!/usr/bin/env bash
# Sonde de la matrice d'accessibilité — phase 1 du chantier supervision.
#
# Lecture seule. Lit les secrets depuis l'environnement local ou Railway et
# n'en affiche JAMAIS la valeur : seulement « présent/absent », des codes HTTP
# et des comptes de séries.
#
# Usage (depuis la racine du dépôt) :
#   ! bash infra/supervision/sonde-matrice.sh
set -u

PROJECT=35efdac2-af65-42a5-88f8-35ed9c40a254
ENVIRONMENT=474a205c-bb75-4484-81f6-85c936f4c7a1
SUPABASE_REF=qkpuwkziwnljfwlzyngr
TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT

echo "== 1. Noms des variables posées sur Railway (aucune valeur)"
for svc in belllum-backend-service bellum-ia-service belllum-monorepo; do
  echo "-- $svc"
  railway variables --service "$svc" --kv 2>/dev/null | cut -d= -f1 \
    | grep -E 'RAILWAY|SUPABASE|VERCEL|GITHUB|GRAFANA|ALERT|RESEND|DATABASE|INTERNAL' || echo "   (aucune correspondance)"
done

echo
echo "== 2. Endpoint métriques Supabase (Prometheus, service_role)"
KEY=$(railway variables --service belllum-backend-service --kv 2>/dev/null | grep '^SUPABASE_SERVICE_ROLE_KEY=' | cut -d= -f2-)
if [ -z "$KEY" ]; then
  echo "   clé absente côté Railway — non évaluable"
else
  code=$(curl -s -o "$TMP/supa.txt" -w '%{http_code}' --max-time 20 \
    -u "service_role:$KEY" "https://$SUPABASE_REF.supabase.co/customer/v1/privileged/metrics")
  echo "   http=$code  séries=$(grep -vc '^#' "$TMP/supa.txt")"
  for m in node_cpu_seconds_total node_memory_MemAvailable_bytes node_filesystem_avail_bytes \
           pg_stat_database_num_backends pg_database_size_bytes pgbouncer_pools_client_active_connections; do
    printf '   %-45s %s\n' "$m" "$(grep -c "^$m" "$TMP/supa.txt")"
  done
fi
unset KEY

echo
echo "== 3. API métriques Railway (jeton RAILWAY_API_TOKEN du service)"
TOK=$(railway variables --service belllum-backend-service --kv 2>/dev/null | grep '^RAILWAY_API_TOKEN=' | cut -d= -f2-)
if [ -z "$TOK" ]; then
  echo "   RAILWAY_API_TOKEN absent sur l'API — non évaluable"
else
  START=$(date -u -v-1H +%Y-%m-%dT%H:%M:%SZ 2>/dev/null || date -u -d '-1 hour' +%Y-%m-%dT%H:%M:%SZ)
  Q="{\"query\":\"query{metrics(projectId:\\\"$PROJECT\\\",environmentId:\\\"$ENVIRONMENT\\\",startDate:\\\"$START\\\",measurements:[CPU_USAGE,MEMORY_USAGE_GB,MEMORY_LIMIT_GB],groupBy:[SERVICE_ID]){measurement tags{serviceId} values{ts value}}}\"}"
  for hdr in "Authorization: Bearer $TOK" "Project-Access-Token: $TOK"; do
    name=${hdr%%:*}
    curl -s --max-time 20 https://backboard.railway.com/graphql/v2 -H "$hdr" \
      -H 'Content-Type: application/json' -d "$Q" > "$TMP/rw.json"
    python3 - "$name" "$TMP/rw.json" <<'PY'
import json, sys
name, path = sys.argv[1], sys.argv[2]
d = json.load(open(path))
if "errors" in d:
    print(f"   [{name}] ERR {d['errors'][0].get('message')}")
else:
    for m in d["data"]["metrics"]:
        v = m["values"]
        print(f"   [{name}] {m['measurement']:<16} {m['tags']['serviceId'][:8]} n={len(v)} last={v[-1]['value'] if v else None}")
PY
  done
fi
unset TOK
