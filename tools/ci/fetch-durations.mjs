#!/usr/bin/env node
/**
 * Durées par fichier des tests web, issues du DERNIER run complet de main.
 *
 * ── Pourquoi ────────────────────────────────────────────────────────────────
 * `apps/web/test-durations.json` est un instantané commité : 41 % de ses
 * fichiers n'existent plus ou n'y sont pas (mesuré le 31/10/2026), donc les
 * paquets de `shard-by-duration.mjs` se déséquilibrent. Le run complet de main
 * (push, nuit) écrit maintenant un rapport JSON vitest par paquet, en artefact
 * `web-test-report-<i>` ; ce script lit les plus récents de main (REST) et en
 * tire un fichier de durées frais.
 *
 * ── Usage ───────────────────────────────────────────────────────────────────
 *   node tools/ci/fetch-durations.mjs --out <fichier.json>
 *       → pour la CI : écrit les durées fraîches, ou RIEN (le job retombe sur le
 *         fichier commité). Sort toujours 0 : une récupération ratée n'est pas un rouge.
 *   node tools/ci/fetch-durations.mjs --write-committed
 *       → rafraîchit `apps/web/test-durations.json` (fichiers disparus retirés).
 *   --suite api : rapports `api-test-report-*` (jest), à utiliser avec --out seulement.
 *   Variables : GITHUB_TOKEN, GITHUB_REPOSITORY (ou --repo owner/nom), --branch (défaut main).
 */
import { execFileSync } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import {
  API_ROOT,
  DURATIONS_FILE,
  durationsFromVitestReport,
  listApiTestFiles,
  listWebTestFiles,
} from './shard-by-duration.mjs'

export const REPORT_PREFIX = 'web-test-report-'
/** Suite API : rapports jest `--json` de main (job `Test (API)`), chemins relatifs à apps/api. */
export const API_REPORT_PREFIX = 'api-test-report-'
export const MAX_REPORTS = 8

/** Fusionne des rapports vitest (un par paquet) en un seul `{ fichier: ms }` trié. */
export function mergeReports(reports, root) {
  const merged = {}
  for (const report of reports) Object.assign(merged, durationsFromVitestReport(report, root))
  return Object.fromEntries(Object.entries(merged).sort(([a], [b]) => (a < b ? -1 : 1)))
}

/** Ne garde que les fichiers qui existent encore sur le disque. */
export function pruneToExisting(durations, existingFiles) {
  const exists = new Set(existingFiles)
  return Object.fromEntries(Object.entries(durations).filter(([file]) => exists.has(file)))
}

/**
 * Parmi les artefacts listés, ceux du DERNIER run de la branche : les plus
 * récents d'abord, tous du même `workflow_run.id`, non expirés, nom de rapport.
 */
export function latestRunArtifacts(artifacts, branch = 'main', prefix = REPORT_PREFIX) {
  const candidates = artifacts
    .filter(a => !a.expired && a.name?.startsWith(prefix) && a.workflow_run?.head_branch === branch)
    .sort((a, b) => (a.created_at < b.created_at ? 1 : -1))
  const runId = candidates[0]?.workflow_run?.id
  return runId === undefined ? [] : candidates.filter(a => a.workflow_run.id === runId)
}

async function api(fetchImpl, token, url) {
  const res = await fetchImpl(url, {
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json' },
  })
  if (!res.ok) throw new Error(`${url} → HTTP ${res.status}`)
  return res
}

/** Télécharge le zip d'un artefact et en lit le premier fichier JSON (`unzip -p`). */
function readZippedJson(bytes) {
  const dir = mkdtempSync(join(tmpdir(), 'durations-'))
  try {
    const zip = join(dir, 'a.zip')
    writeFileSync(zip, bytes)
    return JSON.parse(execFileSync('unzip', ['-p', zip], { encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 }))
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}

/** Durées fraîches du dernier run complet de `branch`, ou `null` si introuvables. */
export async function fetchLatestDurations({
  repo,
  token,
  branch = 'main',
  fetchImpl = fetch,
  readZip = readZippedJson,
  prefix = REPORT_PREFIX,
  root,
}) {
  const list = await (
    await api(fetchImpl, token, `https://api.github.com/repos/${repo}/actions/artifacts?per_page=100`)
  ).json()
  const picked = latestRunArtifacts(list.artifacts ?? [], branch, prefix).slice(0, MAX_REPORTS)
  if (picked.length === 0) return null
  const reports = []
  for (const artifact of picked) {
    const res = await api(fetchImpl, token, artifact.archive_download_url)
    reports.push(readZip(Buffer.from(await res.arrayBuffer())))
  }
  return { durations: mergeReports(reports, root), runId: picked[0].workflow_run.id, count: picked.length }
}

async function main(argv) {
  const flag = name => (argv.includes(name) ? argv[argv.indexOf(name) + 1] : undefined)
  const out = flag('--out')
  const writeCommitted = argv.includes('--write-committed')
  if (!out && !writeCommitted) {
    process.stderr.write('usage : fetch-durations.mjs --out <fichier.json> | --write-committed\n')
    process.exit(2)
  }
  const repo = flag('--repo') ?? process.env.GITHUB_REPOSITORY
  const token = process.env.GITHUB_TOKEN ?? process.env.GH_TOKEN
  try {
    if (!repo || !token) throw new Error('GITHUB_REPOSITORY et GITHUB_TOKEN requis')
    const isApi = flag('--suite') === 'api'
    const found = await fetchLatestDurations({
      repo,
      token,
      branch: flag('--branch') ?? 'main',
      ...(isApi ? { prefix: API_REPORT_PREFIX, root: API_ROOT } : {}),
    })
    if (!found) throw new Error('aucun rapport de durées sur le dernier run de main')
    const durations = pruneToExisting(found.durations, isApi ? listApiTestFiles() : listWebTestFiles())
    const target = out ?? DURATIONS_FILE
    writeFileSync(target, `${JSON.stringify(durations, null, 2)}\n`)
    process.stderr.write(
      `${Object.keys(durations).length} durées (run ${found.runId}, ${found.count} rapport(s)) → ${target}\n`,
    )
  } catch (error) {
    process.stderr.write(`durées fraîches indisponibles (${error.message}) : repli sur le fichier commité.\n`)
    if (writeCommitted) process.exit(1)
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main(process.argv.slice(2))
