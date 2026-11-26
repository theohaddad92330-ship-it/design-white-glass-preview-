#!/usr/bin/env node
/**
 * Les FICHIERS CHAUDS — ceux que chaque lot parallèle veut éditer au même
 * endroit, et sur lesquels chaque intégration conflictait (lot `ci/5-process`).
 *
 * Une branche de lot (`claude/lot*`) ne les touche plus : elle écrit un
 * FRAGMENT `changes/<lot>.yml`, que l'intégrateur applique avec
 * `python3 tools/issues/fusion_fragments.py`. Format : `changes/README.md`.
 *
 * Usage (le hook `pre-push` l'appelle) :
 *   node tools/ci/hot-files.mjs [--base origin/main] [--branch <nom>]
 *   rc 0 = rien à redire · rc 1 = fichiers chauds touchés par un lot (nommés)
 */
import { spawnSync } from 'node:child_process'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

export const HOT_FILES = [
  /^packages\/contracts\/src\/changelog\//,
  /^apps\/api\/src\/modules\/demo\/demo-coverage\.ts$/,
  /^agent_docs\/demo-mode\.md$/,
  /^agent_docs\/chantiers-livres\.md$/,
]

export function isLotBranch(branch) {
  return /^claude\/lot/.test(branch)
}

/** Les fichiers chauds touchés, triés — vide hors branche de lot. */
export function hotFileViolations(branch, changed) {
  if (!isLotBranch(branch)) return []
  return [...new Set(changed.filter(f => HOT_FILES.some(re => re.test(f))))].sort()
}

function git(args) {
  const out = spawnSync('git', args, { encoding: 'utf8' })
  if (out.status !== 0) throw new Error(`git ${args.join(' ')} : ${out.stderr.trim()}`)
  return out.stdout.split('\n').filter(Boolean)
}

function main(argv) {
  const argOf = (name, fallback) => (argv.includes(name) ? argv[argv.indexOf(name) + 1] : fallback)
  const base = argOf('--base', 'origin/main')
  const branch = argOf('--branch', git(['rev-parse', '--abbrev-ref', 'HEAD'])[0] ?? '')
  if (!isLotBranch(branch)) return 0
  const mergeBase = git(['merge-base', 'HEAD', base])[0]
  const touched = hotFileViolations(branch, git(['diff', '--name-only', mergeBase, 'HEAD']))
  if (touched.length === 0) return 0
  process.stderr.write(
    `✗ Branche de lot « ${branch} » : fichiers chauds touchés — un lot écrit un fragment ` +
      `changes/<lot>.yml (format : changes/README.md), l'intégrateur l'applique.\n  ${touched.join('\n  ')}\n`,
  )
  return 1
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url))
  process.exit(main(process.argv.slice(2)))
