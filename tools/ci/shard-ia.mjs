#!/usr/bin/env node
/**
 * Répartit les fichiers de test pytest de `apps/ia` en N paquets de TAILLE proche (#4869.3).
 *
 * Décision de Louis (31/10/2026) : `test-ia` se shard en 3. Le job unique mesuré le 29/10 : 14 min 08 de pytest
 * pour 1 642 fichiers, coupé à 98 % de l'ancien plafond (#4834).
 *
 * pytest n'a pas de `--shard` natif et le lock n'embarque aucun plugin de découpage : on découpe donc par FICHIER
 * (comme `--dist loadfile`, un fichier reste sur UN paquet, état de module intact), au plus gros d'abord dans le
 * paquet le moins chargé (glouton LPT, la taille du fichier pour proxy de durée).
 *
 * Ce qui ne doit jamais arriver : un fichier perdu. La liste vient du DISQUE, et le test
 * `apps/web/src/test/ci-shard-ia.test.ts` vérifie que l'union des paquets est exactement la suite, sans doublon.
 *
 * Usage (depuis ci.yml, dans apps/ia) : node ../../tools/ci/shard-ia.mjs 2/3  → un chemin par ligne
 */
import { readdirSync, statSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const IA_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', 'apps', 'ia')
const SKIPPED = new Set(['.venv', 'node_modules', '__pycache__', '.git', 'build', 'dist'])
/** Les motifs par défaut de pytest (`python_files`). */
const IS_TEST = /^(test_.*|.*_test)\.py$/

/** Fichiers de test de `apps/ia`, chemins relatifs à `apps/ia`, triés. */
export function listIaTestFiles(root = IA_ROOT) {
  const out = []
  const walk = dir => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name)
      if (entry.isDirectory()) {
        if (!SKIPPED.has(entry.name)) walk(full)
      } else if (IS_TEST.test(entry.name)) out.push({ path: relative(root, full), size: statSync(full).size })
    }
  }
  walk(root)
  return out.sort((a, b) => (a.path < b.path ? -1 : 1))
}

/** `count` paquets de chemins ; déterministe (égalité de taille départagée par le chemin). */
export function planIaShards(files, count) {
  const shards = Array.from({ length: count }, () => ({ load: 0, paths: [] }))
  const sorted = [...files].sort((a, b) => b.size - a.size || (a.path < b.path ? -1 : 1))
  for (const file of sorted) {
    const target = shards.reduce((min, s) => (s.load < min.load ? s : min), shards[0])
    target.load += file.size + 1
    target.paths.push(file.path)
  }
  return shards.map(s => s.paths.sort())
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const m = /^(\d+)\/(\d+)$/.exec(process.argv[2] ?? '')
  if (!m || Number(m[1]) < 1 || Number(m[1]) > Number(m[2])) {
    console.error('usage : shard-ia.mjs <i>/<N>')
    process.exit(2)
  }
  const paths = planIaShards(listIaTestFiles(), Number(m[2]))[Number(m[1]) - 1]
  if (paths.length === 0) {
    console.error(`shard ${process.argv[2]} : aucun fichier — refus, un paquet vide masquerait une suite perdue.`)
    process.exit(1)
  }
  process.stdout.write(paths.join('\n') + '\n')
}
