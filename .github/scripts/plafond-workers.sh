#!/usr/bin/env bash
# Le nombre de workers qu'une suite de tests peut lancer SUR CE CONTENEUR.
#
# `nproc` et `os.cpus()` rendent les cœurs de l'HÔTE, même dans un conteneur
# borné à 2 vCPU : jest et vitest en déduisent « cœurs − 1 » et lancent 7
# workers sur un CX43 partagé par quatre runners. Ce script lit ce que le
# conteneur a VRAIMENT — le quota CPU et la limite mémoire de son cgroup — et
# rend le plus petit des trois : cœurs − 1, quota CPU, mémoire ÷ budget.
#
# Usage : plafond-workers.sh <Mio par worker>
#   stdout : le nombre de workers (au moins 1)
#   stderr : une ligne de relevé, pour le log du job
#
# Surcharges réservées aux tests : PLAFOND_CGROUP_ROOT, PLAFOND_NPROC.
set -euo pipefail

mio_par_worker="${1:-1536}"
racine="${PLAFOND_CGROUP_ROOT:-/sys/fs/cgroup}"
coeurs="${PLAFOND_NPROC:-$(nproc 2>/dev/null || getconf _NPROCESSORS_ONLN)}"

# Au-delà de 2^50 octets, cgroup v1 veut dire « illimité ».
ILLIMITE=$((1 << 50))

quota_cpu=""
if [ -r "$racine/cpu.max" ]; then
  read -r quota periode < "$racine/cpu.max"
  if [ "$quota" != "max" ] && [ "${periode:-0}" -gt 0 ]; then quota_cpu=$((quota / periode)); fi
elif [ -r "$racine/cpu/cpu.cfs_quota_us" ] && [ -r "$racine/cpu/cpu.cfs_period_us" ]; then
  quota=$(cat "$racine/cpu/cpu.cfs_quota_us")
  periode=$(cat "$racine/cpu/cpu.cfs_period_us")
  if [ "$quota" -gt 0 ] && [ "$periode" -gt 0 ]; then quota_cpu=$((quota / periode)); fi
fi

memoire=""
if [ -r "$racine/memory.max" ]; then
  valeur=$(cat "$racine/memory.max")
  if [ "$valeur" != "max" ]; then memoire=$valeur; fi
elif [ -r "$racine/memory/memory.limit_in_bytes" ]; then
  valeur=$(cat "$racine/memory/memory.limit_in_bytes")
  if [ "$valeur" -lt "$ILLIMITE" ]; then memoire=$valeur; fi
fi

workers=$((coeurs > 1 ? coeurs - 1 : 1))
par_memoire=""
if [ -n "$quota_cpu" ] && [ "$quota_cpu" -lt "$workers" ]; then workers=$quota_cpu; fi
if [ -n "$memoire" ]; then
  par_memoire=$((memoire / 1024 / 1024 / mio_par_worker))
  if [ "$par_memoire" -lt "$workers" ]; then workers=$par_memoire; fi
fi
if [ "$workers" -lt 1 ]; then workers=1; fi

memoire_mio="aucune"
if [ -n "$memoire" ]; then memoire_mio=$((memoire / 1024 / 1024)); fi
echo "plafond-workers : coeurs_hote=$coeurs quota_cpu=${quota_cpu:-aucun} memoire_mio=$memoire_mio budget_mio=$mio_par_worker par_memoire=${par_memoire:-aucun} -> $workers" >&2
echo "$workers"
