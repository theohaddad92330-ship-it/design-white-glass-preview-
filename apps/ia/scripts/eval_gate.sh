#!/usr/bin/env bash
# ==============================================================================
# Eval gate (golden set) — local runner for `python -m app.eval.gate`.
#
# Deterministic & OFFLINE: replays the committed golden fixtures through the
# eight deterministic metrics and enforces the committed baseline.json —
# never calls Claude or the network. Skips fast when the prompt surface is
# unchanged vs origin/main.
#
# Usage (from anywhere):
#   pnpm eval:gate                 # diff vs origin/main → skip or gate
#   pnpm eval:gate -- --force      # run the bench regardless of the diff
#   pnpm eval:gate -- --base origin/staging
#
# Doc: agent_docs/eval-gate.md
# ==============================================================================
set -euo pipefail

cd "$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

# Pick the interpreter: project venv first, then a system python.
PY=""
for candidate in .venv/bin/python python3.13 python3; do
  if [[ "$candidate" == .venv/bin/python && -x "$candidate" ]]; then
    PY="$candidate"
    break
  elif [[ "$candidate" != .venv/bin/python ]] && command -v "$candidate" >/dev/null 2>&1; then
    PY="$candidate"
    break
  fi
done

if [[ -z "$PY" ]]; then
  echo "eval gate: aucun python3 trouvé" >&2
  exit 1
fi

if ! "$PY" -c "import langgraph" >/dev/null 2>&1; then
  cat >&2 <<'EOF'
eval gate: dépendances IA manquantes pour cet interpréteur.
Installer une fois :
  cd apps/ia && python3.13 -m venv .venv && .venv/bin/pip install -r requirements.txt
EOF
  exit 1
fi

exec "$PY" -m app.eval.gate "$@"
