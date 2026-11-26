#!/usr/bin/env bash
# Mesure les prompts encore sur Sonnet DANS LA CONDITION DE LA PASSERELLE.
#
# Pourquoi ce script existe : les commandes `railway run` du banc dépassent
# 200 caractères. Copiées depuis un message elles se replient, `--prompt` perd
# sa valeur, et l'appel échoue APRÈS avoir peut-être payé.
#
# ⚠️ APPELS RÉELS ET PAYANTS. Le bras Luna est mesuré à `--effort none` parce
# que c'est ce que fait la production : `_openai_tools_reasoning_kwargs` joint
# `reasoning_effort='none'` dès qu'il y a des outils. Mesurer en `medium`
# répond à « Luna peut-elle ? », pas à « que rendrait la passerelle ? ».
set -euo pipefail

cd "$(dirname "$0")/../apps/ia"

if [ ! -f evals-out/model-bench.jsonl ]; then
  echo "✗ evals-out/model-bench.jsonl absent — ce script doit tourner depuis le" >&2
  echo "  DÉPÔT PRINCIPAL : le magasin est gitignoré, donc absent d'un worktree." >&2
  exit 1
fi
echo "· magasin : $(wc -l < evals-out/model-bench.jsonl) entrées"

RUN=(railway run --service bellum-ia-service --environment production --)
PY=.venv/bin/python   # `python` nu n'existe pas sur ce poste

echo
echo "═══ 1/2 · les quatre prompts de LIVRABLE, bras Luna à effort=none ═══"
"${RUN[@]}" "$PY" -m app.eval.bench.livrables \
  --arm luna-livrables --effort none --draws 3 --yes-run-live

echo
echo "═══ 2/2 · les quatre prompts JAMAIS mesurés, les deux bras ═══"
"${RUN[@]}" "$PY" -m app.eval.bench.prompts_restants \
  --effort none --draws 3 --yes-run-live

echo
echo "✓ Terminé. Les bras Luna hors campagne d'origine portent leur effort dans"
echo '  leur nom (luna-livrables-none) : les deux campagnes ne se mélangent pas.'
