#!/usr/bin/env bash
# Installe Grafana Alloy sur les 4 runners CI Hetzner et y pose le jeton
# d'écriture Grafana Cloud — phase 7 du chantier supervision.
#
# À lancer PAR LOUIS depuis la racine du dépôt (le mode automatique refuse,
# à raison, qu'un agent installe un service persistant sur un hôte) :
#
#   ! bash infra/supervision/installer-alloy.sh
#
# Ce que le script fait, sur chaque hôte, par SSH (compte `ci`, sudo) :
#   1. ajoute le dépôt apt signé de Grafana et installe le paquet `alloy` ;
#   2. ajoute l'utilisateur `alloy` au groupe `docker` (cAdvisor lit le socket
#      Docker : ⚠️ ce groupe vaut root sur l'hôte — accepté, l'hôte n'a qu'un
#      rôle, être un runner jetable) ;
#   3. copie infra/supervision/alloy/config.alloy vers /etc/alloy/config.alloy ;
#   4. écrit le jeton d'écriture dans /etc/alloy/grafana-write.token (0640,
#      root:alloy) — lu depuis TON presse-papier (pbpaste), jamais affiché,
#      jamais passé en argument de commande (il ne figure donc pas dans `ps`) ;
#   5. active et redémarre le service, puis affiche son état.
#
# Aucun port n'est ouvert : Alloy ne fait que SORTIR en HTTPS vers Grafana Cloud.
# Idempotent : relançable sans effet de bord (apt, usermod, install, restart).
set -euo pipefail

HOSTS=(2.29.35.39 2.28.226.72 116.203.154.136 116.202.21.185)
HERE=$(cd "$(dirname "$0")" && pwd)
# La config déployée est celle de origin/main, JAMAIS la copie locale : le
# 30/09, une copie locale périmée a redéployé une config sans les sondes.
git -C "$HERE" fetch -q origin main
CONFIG=$(mktemp)
trap 'rm -f "$CONFIG"' EXIT
git -C "$HERE" show origin/main:infra/supervision/alloy/config.alloy > "$CONFIG"
echo "config : origin/main $(git -C "$HERE" rev-parse --short origin/main)"

# Pas de `read` : `!` ne donne pas de terminal (EOF → set -e coupe, mesuré 30/09).
# Le jeton doit être dans le presse-papier AVANT de lancer.
TOKEN=$(pbpaste)
# Repli : un hôte déjà servi porte le jeton — on le relit par SSH (jamais affiché).
if [[ "$TOKEN" != glc_* ]]; then
  for src in "${HOSTS[@]}"; do
    TOKEN=$(ssh -o BatchMode=yes "ci@$src" 'sudo cat /etc/alloy/grafana-write.token 2>/dev/null' || true)
    if [[ "$TOKEN" == glc_* ]]; then echo "jeton relu sur $src"; break; fi
  done
fi
case "$TOKEN" in
  glc_*) echo "jeton lu : format glc_… , ${#TOKEN} caractères" ;;
  *) echo "Le presse-papier ne contient pas un jeton Grafana Cloud (glc_…). Arrêt."; exit 1 ;;
esac

for h in "${HOSTS[@]}"; do
  echo
  echo "== $h"
  ssh -o BatchMode=yes "ci@$h" 'sudo bash -s' <<'REMOTE'
set -euo pipefail
if ! command -v alloy >/dev/null 2>&1; then
  install -d -m 0755 /etc/apt/keyrings
  curl -fsSL https://apt.grafana.com/gpg.key | gpg --dearmor --yes -o /etc/apt/keyrings/grafana.gpg
  echo "deb [signed-by=/etc/apt/keyrings/grafana.gpg] https://apt.grafana.com stable main" > /etc/apt/sources.list.d/grafana.list
  apt-get update -qq
  DEBIAN_FRONTEND=noninteractive apt-get install -y -qq alloy
fi
usermod -aG docker alloy
install -d -m 0750 -o root -g alloy /etc/alloy
# cAdvisor lit AUSSI /run/containerd/containerd.sock (root:root 0660) : le groupe
# docker ne suffit pas (mesuré 30/09, « permission denied »). Alloy tourne donc
# en root — pas plus de pouvoir que le groupe docker, qui vaut déjà root.
install -d -m 0755 /etc/systemd/system/alloy.service.d
printf '[Service]\nUser=root\n' > /etc/systemd/system/alloy.service.d/root.conf
systemctl daemon-reload
REMOTE
  # `sudo tee` et pas `sudo install /dev/stdin` : sudo-rs (Ubuntu récent, le CX53)
  # ne transmet pas /dev/stdin (« install: No such file or directory », 30/09).
  ssh -o BatchMode=yes "ci@$h" 'sudo tee /etc/alloy/config.alloy >/dev/null && sudo chmod 0644 /etc/alloy/config.alloy' < "$CONFIG"
  printf '%s' "$TOKEN" | ssh -o BatchMode=yes "ci@$h" 'sudo tee /etc/alloy/grafana-write.token >/dev/null && sudo chown root:alloy /etc/alloy/grafana-write.token && sudo chmod 0640 /etc/alloy/grafana-write.token'
  ssh -o BatchMode=yes "ci@$h" 'sudo systemctl enable --quiet alloy && sudo systemctl restart alloy && sleep 3 && systemctl is-active alloy && sudo journalctl -u alloy --since "-1min" --no-pager | grep -iE "error|fail" | tail -5 || true'
done
unset TOKEN
echo
echo "Fini. Vérifier dans ~2 min : série up{role=\"ci-runner\"} dans Grafana (4 hôtes attendus)."
