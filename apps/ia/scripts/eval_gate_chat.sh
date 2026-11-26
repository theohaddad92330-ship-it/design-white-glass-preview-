#!/usr/bin/env bash
# ==============================================================================
# Eval gate — chat (local runner for `python -m app.eval.chat_gate`).
#
# #2899 (#2443.7) — gate DÉDIÉ au chat, distinct de `eval_gate.sh` (le gate
# dossier). Rejoue les suites déterministes du chat et vérifie la couverture
# des hard failures — jamais Claude ni le réseau. Skips fast quand la surface
# chat (bellum_advisor.py, laura_router.py, chat_tools.py, chat_orchestrator.py,
# chat_model_routing.py, chat_turn_plan.py, chat_content_guards.py,
# chat_hard_failures.py, chat_corpus_sources.py, copilote_scenario_metadata.py)
# est inchangée vs origin/main.
#
# Usage (from anywhere):
#   pnpm eval:gate:chat                       # diff vs origin/main → skip ou gate
#   pnpm eval:gate:chat -- --force            # rejoue sans détection de diff
#   pnpm eval:gate:chat -- --update-baseline  # fige la couverture actuelle
#
# Doc: apps/ia/app/eval/chat_gate.py
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
  echo "eval gate (chat): aucun python3 trouvé" >&2
  exit 1
fi

if ! "$PY" -c "import langgraph" >/dev/null 2>&1; then
  cat >&2 <<'EOF'
eval gate (chat): dépendances IA manquantes pour cet interpréteur.
Installer une fois :
  cd apps/ia && python3.13 -m venv .venv && .venv/bin/pip install -r requirements.txt
EOF
  exit 1
fi

exec "$PY" -m app.eval.chat_gate "$@"
