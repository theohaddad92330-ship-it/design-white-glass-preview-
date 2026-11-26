#!/usr/bin/env bash
# Banc Sonnet vs Luna sur `bellum_strategy`.
#
# Pourquoi un script et pas deux lignes à copier : les commandes `railway run`
# du banc dépassent 200 caractères, et un retour à la ligne au mauvais endroit
# sépare `--prompt` de sa valeur — l'argument devient une commande à part et
# l'appel échoue après avoir peut-être déjà payé. Un script ne se coupe pas.
#
# ⚠️ APPELS RÉELS ET PAYANTS. Deux prompts rejoués, pas quinze comptes
# réenregistrés : le corpus `doctolib` existe déjà (14 entrées appariables).
#
# ⚠️ Pourquoi on REJOUE Sonnet au lieu de lire le bras `recorded` : ce bras
# contient une capture de 273 caractères pour `bellum_strategy` — une sortie
# vide. Elle tire sa moyenne à 23/100 et ferait conclure « Sonnet est mauvais
# en stratégie », ce qui est faux. On compare à un Sonnet propre, pas à un
# échec de capture.
set -euo pipefail

cd "$(dirname "$0")/../apps/ia"
RUN=(railway run --service bellum-ia-service --environment production --
     .venv/bin/python -m app.eval.bench.run)

echo "── 1/2 · Sonnet rejoué proprement sur bellum_strategy ──"
"${RUN[@]}" replay --model claude-sonnet-5 --arm sonnet-propre \
  --prompt bellum_strategy --yes-run-live

echo
echo "── 2/2 · comparaison, juge Sonnet (consultatif) ──"
"${RUN[@]}" compare --arm sonnet-propre --arm openai:gpt-5.6-luna \
  --judge claude-sonnet-5 --out evals-out/strategy-sonnet-vs-luna.json

echo
echo "Rapport : apps/ia/evals-out/strategy-sonnet-vs-luna.json"
echo "⚠️ Corpus d'UNE entreprise (doctolib) — mince pour une décision permanente."
