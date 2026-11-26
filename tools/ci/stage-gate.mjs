#!/usr/bin/env node
/**
 * Porte d'étage de la CI (lot ci/1-etages, 31/10/2026).
 *
 * Remplace la « coupure au premier rouge » (`CI_COUPE_SUR_ROUGE`) : celle-ci ANNULAIT le run entier, donc un job
 * rouge s'affichait `cancelled` (73 % des runs annulés, la majorité étaient des rouges). Ici, au démarrage, chaque
 * shard LOURD demande à l'API si un job de l'étage RAPIDE du même run est déjà `failure` ; si oui il s'arrête en
 * `failure` explicite (« étage rapide rouge : <job> »), jamais en `cancelled`.
 *
 * Fail-open : si l'API ne répond pas, le shard va au bout (le repli est d'en faire PLUS, jamais moins).
 *
 * Interrupteur : `vars.CI_STAGE_GATE == 'false'` (testé dans ci.yml) laisse les shards aller au bout.
 *
 * Usage (depuis ci.yml) : node tools/ci/stage-gate.mjs
 *   env : GITHUB_TOKEN, GITHUB_REPOSITORY, GITHUB_RUN_ID
 */
import { pathToFileURL } from 'node:url'

/** Jobs de l'étage rapide, reconnus par le début de leur nom d'affichage. */
export const FAST_JOB_PREFIXES = ['Contrôles rapides', "Contrats d'architecture", 'La doc suit le code']

/** Étapes de types du job `Build` (étage rapide) : un job encore en cours expose déjà ses étapes. */
export const FAST_BUILD_STEPS = ['Check types', "Check types — les fichiers de test de l'API"]

/** Nom du premier job (ou étape de types de Build) de l'étage rapide déjà rouge, sinon `null`. */
export function redFastJob(jobs) {
  for (const job of jobs ?? []) {
    const name = job?.name ?? ''
    if (FAST_JOB_PREFIXES.some(prefix => name.startsWith(prefix)) && job.conclusion === 'failure') return name
    if (name === 'Build') {
      const step = (job.steps ?? []).find(s => FAST_BUILD_STEPS.includes(s.name) && s.conclusion === 'failure')
      if (step) return `Build › ${step.name}`
    }
  }
  return null
}

async function main() {
  const { GITHUB_TOKEN, GITHUB_REPOSITORY, GITHUB_RUN_ID } = process.env
  if (!GITHUB_TOKEN || !GITHUB_REPOSITORY || !GITHUB_RUN_ID) {
    console.log('stage-gate : contexte GitHub absent, on va au bout.')
    return 0
  }
  let jobs
  try {
    const res = await fetch(
      `https://api.github.com/repos/${GITHUB_REPOSITORY}/actions/runs/${GITHUB_RUN_ID}/jobs?per_page=100&filter=latest`,
      { headers: { Authorization: `Bearer ${GITHUB_TOKEN}`, Accept: 'application/vnd.github+json' } },
    )
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    jobs = (await res.json()).jobs
  } catch (err) {
    console.log(`stage-gate : API injoignable (${err.message}), on va au bout.`)
    return 0
  }
  const red = redFastJob(jobs)
  if (red) {
    console.log(`::error::étage rapide rouge : ${red}`)
    return 1
  }
  console.log('stage-gate : étage rapide sans rouge, on continue.')
  return 0
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  process.exit(await main())
}
