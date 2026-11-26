#!/usr/bin/env node
// Détecteur de tests flaky (lot ci/6-quarantaine, docs/ci.md §3). REST seulement (`gh api`).
// Lit les rapports JSON des 14 dernières nuits (artefacts `web-test-report-*` et `api-test-report-*` du
// run `schedule` de ci.yml), met à jour tools/ci/quarantine.json, ouvre/maj une issue `flaky` par test.
//   node tools/ci/flaky.mjs [--nights 14] [--issues] [--out tools/ci/quarantine.json]
import { execFile } from 'node:child_process'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { promisify } from 'node:util'

import { readQuarantine, QUARANTINE_FILE } from './quarantine.mjs'

const REPO = process.env.GH_REPO || 'Bellum-AI/belllum-monorepo'
export const EXIT_AFTER_GREEN_NIGHTS = 14

/** Chemin du dépôt (relatif) d'un fichier de rapport absolu : tout après `apps/` ou `packages/`. */
export function repoRelative(file) {
  const p = String(file).replace(/\\/g, '/')
  const m = p.match(/(?:^|\/)((?:apps|packages)\/.+)$/)
  return m ? m[1] : p
}

/** Rapport JSON (vitest/jest) -> Map `fichier|test` -> 'pass' | 'fail'. `prefix` : racine de l'appli si le rapport est relatif à elle. */
export function resultsFromReport(report, prefix = '') {
  const out = new Map()
  for (const suite of report?.testResults ?? []) {
    let file = repoRelative(suite.name)
    if (prefix && !/^(apps|packages)\//.test(file)) file = `${prefix}/${file}`
    for (const t of suite.assertionResults ?? []) {
      if (t.status !== 'passed' && t.status !== 'failed') continue
      const key = `${file}|${t.fullName ?? t.title}`
      // Un test rejoué deux fois dans la nuit (deux shards, cache) : un seul échec suffit.
      if (out.get(key) !== 'fail') out.set(key, t.status === 'failed' ? 'fail' : 'pass')
    }
  }
  return out
}

const addDays = (date, n) => new Date(Date.parse(date) + n * 86400000).toISOString().slice(0, 10)

/**
 * Cœur de décision. `nights` : [{ date: 'YYYY-MM-DD', results: Map }] par date croissante.
 * Un test est FLAKY s'il a une nuit rouge ISOLÉE (la nuit d'avant ou d'après est verte) : une régression
 * dure plusieurs nuits et n'est pas mise en quarantaine — elle reste rouge, c'est voulu.
 * Retourne { entries, entered, exited }.
 */
export function updateQuarantine(existing, nights, today) {
  const keys = new Set()
  for (const n of nights) for (const k of n.results.keys()) keys.add(k)
  const state = key => nights.map(n => n.results.get(key) ?? null)
  const byKey = new Map(existing.map(e => [`${e.file}|${e.test}`, e]))
  const entries = []
  const entered = []
  const exited = []

  for (const key of new Set([...keys, ...byKey.keys()])) {
    const [file, ...rest] = key.split('|')
    const test = rest.join('|')
    const seq = state(key)
    const prev = byKey.get(key)
    const failIdx = seq.map((s, i) => (s === 'fail' ? i : -1)).filter(i => i >= 0)
    const isolated = failIdx.some(i => {
      const before = seq[i - 1]
      const after = seq[i + 1]
      return (before !== 'fail' && before != null) || (after !== 'fail' && after != null)
    })
    const lastFailWindow = failIdx.length ? nights[failIdx[failIdx.length - 1]].date : null

    if (!prev) {
      if (!isolated) continue
      const entry = { file, test, since: nights[failIdx[0]].date, last_fail: lastFailWindow, green_nights: 0 }
      entry.green_nights = greenAfter(seq, nights, entry.last_fail)
      entries.push(entry)
      entered.push(entry)
      continue
    }
    const lastFail = lastFailWindow && lastFailWindow > prev.last_fail ? lastFailWindow : prev.last_fail
    const green = greenAfter(seq, nights, lastFail)
    const seenInWindow = seq.some(s => s !== null)
    if (
      green >= EXIT_AFTER_GREEN_NIGHTS ||
      (!seenInWindow && lastFail < addDays(today, -EXIT_AFTER_GREEN_NIGHTS * 2))
    ) {
      exited.push({ ...prev, last_fail: lastFail, green_nights: green })
      continue
    }
    entries.push({ ...prev, last_fail: lastFail, green_nights: green })
  }
  entries.sort((a, b) => (a.file + a.test).localeCompare(b.file + b.test))
  return { entries, entered, exited }
}

/** Nuits vertes strictement après `lastFail` (le test doit y avoir tourné). */
function greenAfter(seq, nights, lastFail) {
  return seq.filter((s, i) => s === 'pass' && nights[i].date > lastFail).length
}

// ───────────── REST (CLI seulement) ─────────────
const execFileAsync = promisify(execFile)
async function gh(args, opts = {}) {
  const { stdout } = await execFileAsync('gh', ['api', '-H', 'Accept: application/vnd.github+json', ...args], {
    maxBuffer: 256 * 1024 * 1024,
    ...opts,
  })
  return stdout
}
const api = async path => JSON.parse(await gh([`repos/${REPO}/${path}`]))

async function downloadJson(artifactId, dir) {
  const zip = join(dir, `${artifactId}.zip`)
  const { stdout } = await execFileAsync('gh', ['api', `repos/${REPO}/actions/artifacts/${artifactId}/zip`], {
    encoding: 'buffer',
    maxBuffer: 512 * 1024 * 1024,
  })
  writeFileSync(zip, stdout)
  const { stdout: json } = await execFileAsync('unzip', ['-p', zip, '*.json'], { maxBuffer: 512 * 1024 * 1024 })
  return JSON.parse(json)
}

async function collectNights(count) {
  const runs = (await api(`actions/workflows/ci.yml/runs?event=schedule&status=completed&per_page=${count}`))
    .workflow_runs
  const dir = mkdtempSync(join(tmpdir(), 'flaky-'))
  const nights = []
  for (const run of runs) {
    const arts = (await api(`actions/runs/${run.id}/artifacts?per_page=100`)).artifacts.filter(
      a => !a.expired && /^(web|api)-test-report-/.test(a.name),
    )
    const results = new Map()
    for (const a of arts) {
      try {
        const prefix = a.name.startsWith('api-') ? 'apps/api' : 'apps/web'
        for (const [k, v] of resultsFromReport(await downloadJson(a.id, dir), prefix))
          if (results.get(k) !== 'fail') results.set(k, v)
      } catch (error) {
        console.error(`artefact ${a.name} (run ${run.id}) illisible : ${error.message}`)
      }
    }
    if (results.size > 0) nights.push({ date: run.created_at.slice(0, 10), results })
  }
  return nights.sort((a, b) => a.date.localeCompare(b.date))
}

async function syncIssues({ entries, entered, exited }) {
  const open = await api('issues?labels=flaky&state=open&per_page=100')
  const title = e => `[flaky] ${e.file} › ${e.test}`.slice(0, 250)
  for (const e of entries) {
    const body = `Test en quarantaine (tools/ci/quarantine.json).\n\n- depuis : ${e.since}\n- dernier échec : ${e.last_fail}\n- nuits vertes depuis : ${e.green_nights} / ${EXIT_AFTER_GREEN_NIGHTS}\n\nSortie automatique après ${EXIT_AFTER_GREEN_NIGHTS} nuits vertes. Corriger la cause, pas la quarantaine.`
    const found = open.find(i => i.title === title(e))
    if (found) await gh(['--method', 'PATCH', `repos/${REPO}/issues/${found.number}`, '-f', `body=${body}`])
    else if (entered.includes(e))
      await gh([
        '--method',
        'POST',
        `repos/${REPO}/issues`,
        '-f',
        `title=${title(e)}`,
        '-f',
        `body=${body}`,
        '-f',
        'labels[]=flaky',
      ])
  }
  for (const e of exited) {
    const found = open.find(i => i.title === title(e))
    if (found) {
      await gh([
        '--method',
        'POST',
        `repos/${REPO}/issues/${found.number}/comments`,
        '-f',
        'body=Sorti de quarantaine : 14 nuits vertes.',
      ])
      await gh(['--method', 'PATCH', `repos/${REPO}/issues/${found.number}`, '-f', 'state=closed'])
    }
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const argv = process.argv.slice(2)
  const opt = (name, fallback) => (argv.includes(`--${name}`) ? argv[argv.indexOf(`--${name}`) + 1] : fallback)
  const nights = await collectNights(Number(opt('nights', EXIT_AFTER_GREEN_NIGHTS)))
  if (nights.length === 0) {
    // Aucun rapport lisible : on ne touche à rien (jamais vider la quarantaine faute de données).
    console.log('Aucun rapport nocturne lisible : quarantaine inchangée.')
    process.exit(0)
  }
  const out = opt('out', QUARANTINE_FILE)
  const result = updateQuarantine(readQuarantine(out), nights, new Date().toISOString().slice(0, 10))
  writeFileSync(out, JSON.stringify(result.entries, null, 2) + '\n')
  console.log(
    `${nights.length} nuits lues · ${result.entries.length} en quarantaine · +${result.entered.length} · -${result.exited.length}`,
  )
  if (argv.includes('--issues')) await syncIssues(result)
}
