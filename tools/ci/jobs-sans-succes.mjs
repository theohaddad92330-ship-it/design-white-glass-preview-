#!/usr/bin/env node
/**
 * Nomme tout job déclaré dans `.github/workflows/ci.yml` qui n'a JAMAIS rendu `success` sur les N derniers runs.
 *
 * ── Pourquoi (#4873, suite du point (b) de #4830) ───────────────────────────
 * Un job qui n'a jamais rendu `success` est indiscernable d'une garde décorative. Trois cliquets décoratifs trouvés du
 * 27 au 29/10/2026 avaient cette forme : `Test (API)` en `jest | tee` sans `pipefail` (#4787), un plafond de dette lu sur
 * tous les chiffres du fichier, `dette-formatage` mort à `setup-node` sur un `.nvmrc` inexistant (#4829, rouge sur 9 runs
 * de `main`). Les gardes statiques attrapent le troisième ; seule une mesure sur l'historique des runs les attrape tous.
 *
 * ── Pourquoi une ROUTINE et pas une garde de CI ─────────────────────────────
 * La CI ne doit pas dépendre de l'API GitHub pour se juger : ce script se lance à la main ou par la routine
 * hebdomadaire `.github/workflows/jobs-sans-succes.yml` (lundi, #4873.2), jamais depuis `ci.yml`.
 *
 * ── Ce qui compte ───────────────────────────────────────────────────────────
 *   - au moins un `success` sur la fenêtre            → sain ;
 *   - aucun `success` et au moins un résultat réel    → NOMMÉ (code de sortie 1) ;
 *   - uniquement `skipped` / jamais vu                → listé à part, PAS nommé : `skipped` est la portée sélective
 *     (`changes`), pas un défaut.
 *
 * ── Usage ───────────────────────────────────────────────────────────────────
 *   node tools/ci/jobs-sans-succes.mjs [--runs 40]     (exige `gh` authentifié)
 */
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..')
const CI_YML = join(ROOT, '.github', 'workflows', 'ci.yml')

/** Les jobs de `ci.yml` : `{ id, name }`, `name` valant l'identifiant quand le job n'en porte pas (affichage de GitHub). */
export function declaredJobs(ciYml) {
  const lines = ciYml.split('\n')
  const start = lines.findIndex(line => /^jobs:\s*$/.test(line))
  if (start === -1) return []
  const jobs = []
  for (const line of lines.slice(start + 1)) {
    if (/^\S/.test(line) && !line.startsWith('#')) break
    const id = /^ {2}([A-Za-z0-9_-]+):\s*$/.exec(line)?.[1]
    if (id) {
      jobs.push({ id, name: id })
      continue
    }
    const name = /^ {4}name:\s*(.+?)\s*$/.exec(line)?.[1]
    const current = jobs[jobs.length - 1]
    if (name && current && current.name === current.id) current.name = name.replace(/^(['"])(.*)\1$/, '$2')
  }
  return jobs
}

/** Un job de matrice s'affiche « Test (Web) (2) » : il appartient au job nommé « Test (Web) ». */
function belongsTo(displayName, declaredName) {
  return displayName === declaredName || displayName.startsWith(`${declaredName} (`)
}

/**
 * @param {{ id: string, name: string }[]} declared
 * @param {{ jobs: { name: string, conclusion: string | null }[] }[]} runs
 * @returns {{ never: string[], unobserved: string[] }}
 */
export function jobsWithoutSuccess(declared, runs) {
  const never = []
  const unobserved = []
  for (const job of declared) {
    const results = runs
      .flatMap(run => run.jobs)
      .filter(entry => belongsTo(entry.name, job.name))
      .map(entry => entry.conclusion)
    if (results.includes('success')) continue
    const real = results.filter(conclusion => conclusion && conclusion !== 'skipped')
    ;(real.length > 0 ? never : unobserved).push(job.id)
  }
  return { never, unobserved }
}

function gh(args) {
  return JSON.parse(execFileSync('gh', args, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }))
}

function main() {
  const flag = process.argv.indexOf('--runs')
  const limit = flag === -1 ? 40 : Number.parseInt(process.argv[flag + 1] ?? '', 10)
  if (!Number.isInteger(limit) || limit < 1) throw new Error('--runs attend un entier positif')
  const listed = gh(['run', 'list', '--workflow', 'ci.yml', '--limit', String(limit), '--json', 'databaseId'])
  const runs = listed.map(run => gh(['run', 'view', String(run.databaseId), '--json', 'jobs']))
  const { never, unobserved } = jobsWithoutSuccess(declaredJobs(readFileSync(CI_YML, 'utf8')), runs)
  console.log(`${runs.length} runs lus.`)
  if (unobserved.length > 0)
    console.log(`Sans résultat réel (skipped ou jamais vu, non nommés) : ${unobserved.join(', ')}`)
  if (never.length === 0) return console.log('Aucun job sans success.')
  console.log(`::error::Jobs de ci.yml sans AUCUN success sur la fenêtre : ${never.join(', ')}`)
  process.exitCode = 1
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main()
