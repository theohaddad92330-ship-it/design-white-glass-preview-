#!/usr/bin/env bash
#
# Nettoyage automatique des runners CI : /tmp des conteneurs, dossier de travail
# corrompu, cache de build. Lancé toutes les 30 min par
# /etc/cron.d/ci-runner-nettoyage (voir cloud-init.yaml et runbook.md).
#
# POURQUOI — constat du 02/11/2026, mesuré par SSH :
#  (a) le /tmp de chaque conteneur runner gardait ~2 000 dossiers d'environ
#      150 Mo laissés par les jobs (≈ 41 Go par runner) : 3 hôtes à 84-90 % de
#      disque ; après purge, 37-39 %.
#  (b) le dossier de travail /home/pwuser/_work/belllum-monorepo/belllum-monorepo
#      (runner NON éphémère) avait un index git corrompu : `actions/checkout`
#      échouait sur « Path '…' not uptodate; will not remove from working tree »,
#      ne posait pas package.json, puis `pnpm/action-setup` disait « No pnpm
#      version is specified ». Le même runner (vps-255ad2ca13ac,
#      vps-72429e6ffe41, vps-68fb497eb239) recassait chaque relance, PR et main.
#
# RÈGLES
#  - /tmp : toujours purgé (même runner occupé) au-delà de 6 h, sauf jest_rs :
#    un job n'utilise que du récent.
#  - dossier de travail : seulement si le runner est LIBRE (pas de Runner.Worker)
#    ET (pas de package.json OU `git reset --hard HEAD` y échoue). Un dossier
#    sain n'est jamais supprimé : il garde node_modules et .turbo.
#  - disque / ≥ 85 % : `docker builder prune -af` (jamais de volumes : le store
#    pnpm y vit).
#
# DRY_RUN=1 : affiche sans rien modifier (le reset est remplacé par
# `git status --porcelain`).
set -uo pipefail

WORKDIR="${WORKDIR:-/home/pwuser/_work/belllum-monorepo/belllum-monorepo}"
SEUIL_DISQUE="${SEUIL_DISQUE:-85}"
DRY_RUN="${DRY_RUN:-0}"
HOTE="$(hostname)"

log() { printf '%s %s %s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$HOTE" "$*"; }

[ "$DRY_RUN" = "1" ] && log "DRY_RUN=1 : rien n'est modifié"

conteneurs="$(docker ps --format '{{.Names}}' | grep runner || true)"
if [ -z "$conteneurs" ]; then
  log "aucun conteneur runner en cours"
fi

for c in $conteneurs; do
  # (1) /tmp : toujours, même occupé.
  if [ "$DRY_RUN" = "1" ]; then
    n="$(docker exec "$c" sh -c "find /tmp -mindepth 1 -maxdepth 1 -mmin +360 ! -name jest_rs | wc -l" 2>/dev/null || echo '?')"
    log "$c: /tmp — $n entrée(s) de plus de 6 h seraient supprimées"
  else
    docker exec "$c" sh -c "find /tmp -mindepth 1 -maxdepth 1 -mmin +360 ! -name jest_rs -exec rm -rf {} +" \
      || log "$c: purge de /tmp en échec"
    log "$c: /tmp purgé"
  fi

  # (2) dossier de travail : seulement si le runner est libre.
  if docker exec "$c" pgrep -f Runner.Worker >/dev/null 2>&1; then
    log "$c: occupé (Runner.Worker), dossier de travail laissé"
    continue
  fi
  if ! docker exec "$c" test -d "$WORKDIR"; then
    continue
  fi

  raison=""
  if ! docker exec "$c" test -f "$WORKDIR/package.json"; then
    raison="package.json absent"
  elif [ "$DRY_RUN" = "1" ]; then
    docker exec "$c" sh -c "cd '$WORKDIR' && git status --porcelain >/dev/null 2>&1" \
      || raison="git status en échec"
  else
    docker exec "$c" sh -c "cd '$WORKDIR' && git reset -q --hard HEAD" >/dev/null 2>&1 \
      || raison="git reset --hard en échec"
  fi

  if [ -z "$raison" ]; then
    log "$c: dossier de travail sain, conservé"
  elif [ "$DRY_RUN" = "1" ]; then
    log "$c: dossier de travail corrompu ($raison) — serait supprimé"
  else
    docker exec "$c" rm -rf "$WORKDIR" \
      && log "$c: dossier de travail corrompu ($raison) — supprimé, le prochain checkout reclone" \
      || log "$c: suppression du dossier de travail en échec ($raison)"
  fi
done

# (3) disque de l'hôte.
usage="$(df --output=pcent / | tail -1 | tr -dc '0-9')"
if [ -n "$usage" ] && [ "$usage" -ge "$SEUIL_DISQUE" ]; then
  if [ "$DRY_RUN" = "1" ]; then
    log "disque / à ${usage} % (≥ ${SEUIL_DISQUE}) — docker builder prune -af serait lancé"
  else
    log "disque / à ${usage} % (≥ ${SEUIL_DISQUE}) — docker builder prune -af"
    docker builder prune -af >/dev/null 2>&1 || log "docker builder prune en échec"
  fi
else
  log "disque / à ${usage:-?} %"
fi
