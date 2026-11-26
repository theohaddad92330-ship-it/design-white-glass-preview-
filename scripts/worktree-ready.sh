#!/usr/bin/env bash
#
# scripts/worktree-ready.sh — un worktree prêt à écrire, sans payer un build complet par agent.
#
# Pourquoi. Mesuré le 09/09/2026 : 12 worktrees d'agents créés dans la journée,
# chacun avec son `turbo build` COMPLET (11 en 70 min) ; load average 38 sur 12
# cœurs, une suite ciblée passée de ~1 min à 1 h 11, trois agents sur cinq
# perdus dans « Failed to resolve import @bellum/… » (le piège « worktree neuf
# sans dist/ », .claude/projet.md §4). La cause : le cache de turbo est
# `.turbo/cache` À LA RACINE DE CHAQUE WORKTREE (gitignoré), donc tous partaient
# à froid pour des sorties identiques au même commit. Ce script pointe tous les
# worktrees sur le cache du dépôt principal (878 Mo le 09/09) : le premier
# worktree à un commit construit, les suivants RESTAURENT.
#
# Usage
#   scripts/worktree-ready.sh                     # prépare le worktree COURANT (un agent en isolation)
#   scripts/worktree-ready.sh --new <nom> [base]  # crée .claude/worktrees/<nom> (branche <nom>, base origin/main), puis le prépare
#
# Ce qu'il fait, dans l'ordre : `pnpm install --prefer-offline --frozen-lockfile`
# (2 s sur un worktree déjà installé, 10 s à neuf — mesuré) · `turbo build` des SEULS paquets (`./packages/*`, pas les apps)
# avec `--cache-dir` sur le cache du dépôt principal · imprime « N cached, M
# total » et le préambule à coller dans le prompt de l'agent.
#
# Codes de sortie : 0 prêt · 1 usage, git, install ou build en échec (la sortie
# de turbo est dans <worktree>/.turbo/worktree-ready.log).
set -euo pipefail

usage() { sed -n '3,25p' "$0"; exit 1; }

# ⚠️ pas de `exit` dans l'awk : il ferme le tube, `git worktree list` prend un
# SIGPIPE et, sous `set -o pipefail`, le script sort en 141 avant d'avoir rien fait.
MAIN="$(git worktree list --porcelain | awk '/^worktree /{ if (!vu++) print $2 }')"
[ -d "$MAIN/packages" ] || { echo "dépôt principal introuvable depuis $(pwd)" >&2; exit 1; }
CACHE="$MAIN/.turbo/cache"

if [ "${1:-}" = "--new" ]; then
  NOM="${2:-}"; BASE="${3:-origin/main}"
  [ -n "$NOM" ] || usage
  TARGET="$MAIN/.claude/worktrees/$NOM"
  git -C "$MAIN" fetch origin -q
  git -C "$MAIN" worktree add "$TARGET" -b "$NOM" "$BASE"
elif [ $# -eq 0 ]; then
  TARGET="$(git rev-parse --show-toplevel)"
  [ "$TARGET" != "$MAIN" ] || { echo "ici c'est le dépôt principal : rien à préparer (lancer depuis un worktree, ou --new <nom>)" >&2; exit 1; }
else
  usage
fi

cd "$TARGET"
mkdir -p .turbo
LOG="$TARGET/.turbo/worktree-ready.log"

t0=$(date +%s)
pnpm install --prefer-offline --frozen-lockfile > "$LOG" 2>&1 || { echo "pnpm install a échoué — voir $LOG" >&2; exit 1; }
t1=$(date +%s)
# Les paquets seulement : les tests des apps tournent depuis leurs sources.
pnpm exec turbo build --filter='./packages/*' --cache-dir="$CACHE" >> "$LOG" 2>&1 || { echo "turbo build a échoué — voir $LOG" >&2; tail -20 "$LOG" >&2; exit 1; }
t2=$(date +%s)
# ⚠️ turbo écrit « Cached: » précédé d'une séquence ANSI (`ESC[1m`) : un motif
# ancré sur `^\s*Cached:` ne matche jamais, grep sort en 1, et sous
# `set -e` + `pipefail` c'est TOUTE la préparation qui échoue après coup.
cached="$(perl -pe 's/\e\[[0-9;]*m//g' "$LOG" | grep -E '^[[:space:]]*Cached:' | tail -1 | sed 's/^ *//')" || cached=""
[ -n "$cached" ] || cached="turbo n a pas ecrit de ligne Cached (voir $LOG)"

echo "worktree : $TARGET ($(git rev-parse --short HEAD))"
echo "install  : $((t1 - t0)) s · paquets : $((t2 - t1)) s · $cached · cache : $CACHE"

cat <<EOF

--- à coller dans le prompt de l'agent ---
Worktree prêt : $TARGET (paquets construits depuis le cache partagé). NE PAS relancer \`turbo build\`, \`pnpm build\` ni \`pnpm install\`.
Tests : uniquement les FICHIERS touchés, 2 workers, une seule suite à la fois — la machine est partagée (12 cœurs, 3 écrivains max) :
  cd apps/web && node node_modules/vitest/vitest.mjs run <chemins RELATIFS, sans le préfixe apps/web/> --maxWorkers=2
  node apps/api/node_modules/jest/bin/jest.js --config apps/api/jest.config.js --maxWorkers=2 <chemin>
⚠️ Le \`cd apps/web\` n'est PAS un confort : lancé depuis la racine du worktree, vitest ne charge NI l'alias \`@\` NI \`environment: jsdom\`
   (\`apps/web/vitest.config.ts\` n'est pas repris depuis ce cwd). Un fichier déjà vert rend alors « Failed to resolve import @/test-utils/… »,
   ce qui se lit comme un rouge de CODE. Deux agents indépendants y ont perdu du temps le même jour (10/09/2026).
Jamais une suite de dossier, jamais \`turbo test\`, jamais plus de ~20 chemins d'un coup (au-delà vitest rend « No test files found » + rc=1).
Un rouge pendant que \`uptime\` dépasse 12 n'est pas un rouge : relancer seul.
\`Failed to resolve import @bellum/…\` → paquet non construit : relancer scripts/worktree-ready.sh, ne pas enquêter.
\`Failed to resolve import @/…\` → ce n'est PAS le même défaut : c'est le cwd, le script n'y changera rien. Voir le \`cd\` ci-dessus.
EOF
