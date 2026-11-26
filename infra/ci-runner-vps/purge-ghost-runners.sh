#!/usr/bin/env bash
# Retire du dépôt les runners auto-hébergés restés « offline ».
#
# Pourquoi ce script existe : un conteneur arrêté brutalement (redéploiement,
# OOM, replica retirée) n'a pas le temps d'exécuter le `--remove` de son
# entrypoint. L'entrée reste alors « offline » côté GitHub, indéfiniment. Le
# `--replace` du démarrage suivant ne reprend une entrée que si le NOM est le
# même — or le nom contient l'identifiant de la replica, qui change à chaque
# fois. Les fantômes s'accumulent donc sans plafond : 184 pour 48 runners réels
# au 03/09/2026, soit quatre fantômes par runner vivant.
#
# Ce n'est pas qu'un problème d'affichage : `gh api .../actions/runners` devient
# illisible, et c'est la commande par laquelle on répond à « combien de runners
# répondent, et combien travaillent ». Un inventaire qu'on ne peut plus lire ne
# sert plus à décider — c'est comme ça que 42 replicas ont pu tourner à vide.
#
# Sûreté : le script ne touche QUE les entrées `offline`. Un runner en ligne,
# occupé ou non, n'est jamais supprimé. Et supprimer un fantôme est sans effet
# de bord : si la machine revient, elle se réenregistre au démarrage.
#
#   ./purge-ghost-runners.sh            # liste ce qui serait supprimé, ne fait rien
#   ./purge-ghost-runners.sh --apply    # supprime

set -euo pipefail

REPO="${GITHUB_REPO:-Bellum-AI/belllum-monorepo}"
APPLY=false
[ "${1:-}" = "--apply" ] && APPLY=true

command -v gh >/dev/null || {
  echo "gh introuvable. Installer GitHub CLI puis 'gh auth login'." >&2
  exit 1
}

mapfile -t GHOSTS < <(
  gh api "repos/$REPO/actions/runners" --paginate \
    -q '.runners[] | select(.status=="offline") | [.id, .name] | @tsv'
)

ONLINE=$(gh api "repos/$REPO/actions/runners" --paginate -q '.runners[] | select(.status=="online") | .id' | wc -l | tr -d ' ')

echo "Dépôt   : $REPO"
echo "En ligne: $ONLINE (préservés)"
echo "Fantômes: ${#GHOSTS[@]}"

if [ "${#GHOSTS[@]}" -eq 0 ]; then
  echo "Rien à faire."
  exit 0
fi

if [ "$APPLY" = false ]; then
  printf '%s\n' "${GHOSTS[@]}" | head -5
  [ "${#GHOSTS[@]}" -gt 5 ] && echo "  … et $((${#GHOSTS[@]} - 5)) autres"
  echo
  echo "Simulation. Relancer avec --apply pour supprimer."
  exit 0
fi

failed=0
for entry in "${GHOSTS[@]}"; do
  id="${entry%%$'\t'*}"
  if gh api -X DELETE "repos/$REPO/actions/runners/$id" --silent 2>/dev/null; then
    printf '.'
  else
    printf 'x'
    failed=$((failed + 1))
  fi
done
echo

echo "Supprimés : $((${#GHOSTS[@]} - failed)) / ${#GHOSTS[@]}"
[ "$failed" -gt 0 ] && echo "Échecs : $failed (jeton sans droit 'Administration: read & write' ?)" >&2
exit 0
