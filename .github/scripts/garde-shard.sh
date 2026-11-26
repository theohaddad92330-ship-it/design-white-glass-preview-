#!/usr/bin/env bash
# UN SHARD QUI EXÉCUTE TOUTE LA SUITE N'EST PAS UN SHARD.
#
# Mesuré le 25/10/2026 sur trois runs CI (39925939590 push main, 40093361204
# push main, 40088952172 PR #4489) : en mode `complet`, les TROIS shards de
# `Test (API)` ont rapporté chacun la suite ENTIÈRE —
#
#   shard 1/3 : 851 of 855 suites   (36 min 54)
#   shard 2/3 : 847 of 855 suites   ( 8 min)
#   shard 3/3 : 854 of 855 suites   ( 8 min)
#
# soit trois suites complètes par run au lieu d'un tiers chacune, et un chemin
# critique fixé par une suite complète. Les quatre shards de `Test (Web)` ont
# rapporté 713, 715, 715 et 715 fichiers — même symptôme.
#
# La garde qui existait vérifiait que `--shard=i/N` ENTRE DANS LE HASH DE TÂCHE
# de turbo. C'est vrai, et ça ne prouve rien : le hash prouve que turbo a vu
# des arguments différents, pas que jest a exécuté des fichiers différents.
# Ce script vérifie la seule chose qui compte — COMBIEN de fichiers ont tourné.
#
#   garde-shard.sh <log> <total_suite> <nb_shards> <étiquette>
#
# Il lit le compte dans la sortie de l'outil lui-même :
#   jest    « Test Suites: … 851 of 855 total »  →  855
#   vitest  « Test Files  715 passed (715) »     →  715
#
# Tolérance ×1,6 sur la part attendue : les fichiers ne se répartissent pas
# exactement, et un shard peut légitimement être plus chargé. ×1,6 laisse
# passer un découpage bancal et arrête un découpage INEXISTANT — c'est la
# seule chose qu'on cherche ici.
#
# Sortie 0 : le shard a bien exécuté sa part. Sortie 1 : il a exécuté la suite.
set -uo pipefail

LOG="${1:?usage: garde-shard.sh <log> <total_suite> <nb_shards> <étiquette> [<fichiers_attendus>]}"
# Pas de `${2:?}` : un total vide est le cas NORMAL quand `jest --listTests`
# a échoué en amont. La garde doit alors avertir et laisser passer, pas tuer
# un job de test qui, lui, a peut-être très bien tourné.
TOTAL="${2-}"
SHARDS="${3-}"
LABEL="${4:-shard}"

[ -f "$LOG" ] || { echo "::warning::garde-shard : log introuvable ($LOG) — garde non appliquée."; exit 0; }
case "$TOTAL" in ''|*[!0-9]*) echo "::warning::garde-shard : total de suite non chiffré ('$TOTAL') — garde non appliquée."; exit 0 ;; esac
[ "$TOTAL" -gt 0 ] || { echo "::warning::garde-shard : total de suite à 0 — garde non appliquée."; exit 0; }
case "$SHARDS" in ''|*[!0-9]*) echo "::warning::garde-shard : nombre de shards non chiffré ('$SHARDS') — garde non appliquée."; exit 0 ;; esac
[ "$SHARDS" -gt 1 ] || { echo "garde-shard : un seul shard, rien à vérifier."; exit 0; }

# Les codes ANSI de turbo collent aux nombres : on les retire avant de lire.
propre="$(sed -E 's/\x1b\[[0-9;]*m//g' "$LOG")"

# jest : « … 851 of 855 total » ou « … 855 total ». vitest : « (715) ».
execute="$(printf '%s' "$propre" | grep -oE 'Test Suites:.*[0-9]+ total' | tail -1 \
  | grep -oE '[0-9]+ total' | grep -oE '[0-9]+' | tail -1)"
[ -n "$execute" ] || execute="$(printf '%s' "$propre" | grep -oE 'Test Files.*\(([0-9]+)\)' | tail -1 \
  | grep -oE '\([0-9]+\)' | tr -d '()')"

if [ -z "$execute" ]; then
  echo "::warning::garde-shard ($LABEL) : aucun résumé d'outil trouvé dans $LOG — garde non appliquée."
  exit 0
fi

plafond=$(( TOTAL * 16 / (SHARDS * 10) ))
[ "$plafond" -ge 1 ] || plafond=1
# 5e argument OPTIONNEL : le nombre de fichiers que CE shard devait recevoir. Un découpage par DURÉE
# (Test (API), ci/shards-api-par-duree) n'a pas le même nombre de fichiers par shard — plafond 1,6 × la
# part égale pourrait rougir un shard sain ; on borne alors sur la liste réellement donnée (+30 %).
ATTENDU="${5-}"
case "$ATTENDU" in ''|*[!0-9]*) ;; *) [ "$ATTENDU" -gt 0 ] && plafond=$(( ATTENDU * 13 / 10 + 1 )) ;; esac

echo "garde-shard ($LABEL) : $execute fichiers exécutés · suite $TOTAL · $SHARDS shards · plafond $plafond"
{
  echo "- \`$LABEL\` : **$execute** exécutés sur une suite de $TOTAL ($SHARDS shards, plafond $plafond)"
} >> "${GITHUB_STEP_SUMMARY:-/dev/null}" 2>/dev/null || true

if [ "$execute" -gt "$plafond" ]; then
  echo "::error::$LABEL a exécuté $execute fichiers alors que la suite en compte $TOTAL répartis sur $SHARDS shards (plafond $plafond). Le découpage n'a pas eu lieu : chaque shard refait la suite entière, le chemin critique est celui d'une suite complète, et le coût est multiplié par $SHARDS. Vérifier que \`--shard=i/$SHARDS\` arrive bien jusqu'à l'outil de test (mesure du 25/10/2026, claude-skills)."
  exit 1
fi
exit 0
