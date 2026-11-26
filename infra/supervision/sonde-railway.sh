#!/usr/bin/env bash
# Sonde du jeton RAILWAY_METRICS_TOKEN : quel en-tête accepte-t-il, et l'API
# `metrics` répond-elle ? Lecture seule, n'affiche JAMAIS le jeton.
#   ! bash infra/supervision/sonde-railway.sh
set -u
PROJECT=35efdac2-af65-42a5-88f8-35ed9c40a254
ENVIRONMENT=474a205c-bb75-4484-81f6-85c936f4c7a1
TMP=$(mktemp -d); trap 'rm -rf "$TMP"' EXIT

TOK=$(railway variable list --service belllum-backend-service --kv 2>/dev/null | grep '^RAILWAY_METRICS_TOKEN=' | cut -d= -f2-)
[ -z "$TOK" ] && { echo "RAILWAY_METRICS_TOKEN absent"; exit 1; }
echo "jeton présent, ${#TOK} caractères"

START=$(date -u -v-1H +%Y-%m-%dT%H:%M:%SZ)
Q="{\"query\":\"query{metrics(projectId:\\\"$PROJECT\\\",environmentId:\\\"$ENVIRONMENT\\\",startDate:\\\"$START\\\",sampleRateSeconds:300,measurements:[CPU_USAGE,CPU_LIMIT,MEMORY_USAGE_GB,MEMORY_LIMIT_GB],groupBy:[SERVICE_ID]){measurement tags{serviceId} values{ts value}}}\"}"
for kind in project bearer; do
  if [ $kind = project ]; then H="Project-Access-Token: $TOK"; else H="Authorization: Bearer $TOK"; fi
  printf 'header = "%s"\n' "$H" | curl -s --max-time 20 -K - https://backboard.railway.com/graphql/v2 \
    -H 'Content-Type: application/json' -d "$Q" > "$TMP/r.json"
  python3 - "$kind" "$TMP/r.json" <<'PY'
import json, sys
kind, path = sys.argv[1], sys.argv[2]
try: d = json.load(open(path))
except Exception as e: print(f"[{kind}] réponse illisible"); sys.exit()
if "errors" in d: print(f"[{kind}] ERR {d['errors'][0].get('message')}"); sys.exit()
for m in d["data"]["metrics"]:
    v = m["values"]
    print(f"[{kind}] {m['measurement']:<16} {m['tags']['serviceId'][:8]} n={len(v)} dernier={v[-1]['value'] if v else None}")
PY
done

echo "== Durées (en-tête Project-Access-Token) — 3 essais par fenêtre"
for w in 1 24 168; do
  S2=$(date -u -v-${w}H +%Y-%m-%dT%H:%M:%SZ); step=300; [ $w = 168 ] && step=3600
  Q2="{\"query\":\"query{metrics(projectId:\\\"$PROJECT\\\",environmentId:\\\"$ENVIRONMENT\\\",startDate:\\\"$S2\\\",sampleRateSeconds:$step,measurements:[CPU_USAGE,CPU_LIMIT,MEMORY_USAGE_GB,MEMORY_LIMIT_GB],groupBy:[SERVICE_ID]){measurement tags{serviceId} values{ts value}}}\"}"
  for k in 1 2 3; do
    printf 'header = "Project-Access-Token: %s"\n' "$TOK" | curl -s -o /dev/null -w "   ${w} h  pas ${step} s : http=%{http_code} total=%{time_total}s\n" --max-time 60 -K - \
      https://backboard.railway.com/graphql/v2 -H 'Content-Type: application/json' -d "$Q2"
  done
done
unset TOK
