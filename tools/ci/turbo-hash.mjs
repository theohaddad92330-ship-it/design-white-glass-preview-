#!/usr/bin/env node
/**
 * Affiche le hash turbo de `@bellum/contracts#build` et ses ENTRÉES, pour comparer deux jobs sur le même SHA
 * (lot B2 ci/1-caches). Deux jobs, un SHA, deux hashs ⇒ la différence est dans une ligne de ce rapport :
 * fichiers d'entrée (empreinte de la liste), dépendances externes (lockfile), variables d'environnement.
 *
 *   node tools/ci/turbo-hash.mjs [@bellum/paquet]
 */
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

/** Résume un `turbo run build --dry=json` en lignes comparables d'un job à l'autre. */
export function summarizeDryRun(dry, taskId) {
  const task = (dry.tasks ?? []).find(t => t.taskId === taskId)
  if (!task) return [`tâche introuvable : ${taskId}`]
  const inputs = Object.entries(task.inputs ?? {}).sort(([a], [b]) => (a < b ? -1 : 1))
  const digest = createHash('sha1').update(JSON.stringify(inputs)).digest('hex').slice(0, 12)
  return [
    `hash=${task.hash}`,
    `externalDeps=${task.hashOfExternalDependencies}`,
    `inputs=${inputs.length} (empreinte ${digest})`,
    `env=${JSON.stringify(task.environmentVariables ?? {})}`,
    `deps=${(task.dependencies ?? []).join(',')}`,
  ]
}

function main(argv) {
  const pkg = argv[0] ?? '@bellum/contracts'
  const out = execFileSync('pnpm', ['exec', 'turbo', 'run', 'build', '--filter', pkg, '--dry=json'], {
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
  })
  const dry = JSON.parse(out.slice(out.indexOf('{')))
  for (const line of summarizeDryRun(dry, `${pkg}#build`)) console.log(line)
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main(process.argv.slice(2))
