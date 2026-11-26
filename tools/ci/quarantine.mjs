#!/usr/bin/env node
// Quarantaine des tests flaky (lot ci/6-quarantaine, docs/ci.md §3).
// Décision « bloque / ne bloque pas » pour un shard de PR, à partir d'un rapport JSON vitest ou jest
// (même forme : testResults[].assertionResults[]). Usage CLI :
//   node tools/ci/quarantine.mjs active                       -> rc 0 si la quarantaine a des entrées
//   node tools/ci/quarantine.mjs decide --report <json> --rc <n>  -> rc 0 = vert (warning), rc 1 = rouge
// JAMAIS de retry : un test hors quarantaine rouge => rouge. Rapport absent/illisible => rouge.
import { existsSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

export const QUARANTINE_FILE = join(dirname(fileURLToPath(import.meta.url)), 'quarantine.json')

export function readQuarantine(file = QUARANTINE_FILE) {
  if (!existsSync(file)) return []
  try {
    const parsed = JSON.parse(readFileSync(file, 'utf8'))
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

const posix = path => String(path).replace(/\\/g, '/')

/** Le fichier du rapport est absolu, celui de la quarantaine relatif à la racine du dépôt. */
export function sameFile(reportFile, entryFile) {
  const a = posix(reportFile)
  const b = posix(entryFile).replace(/^\.\//, '')
  return a === b || a.endsWith(`/${b}`)
}

/** Tests rouges d'un rapport. `suites` : fichiers rouges sans test nommé (import cassé, crash) — jamais excusables. */
export function failedTests(report) {
  const tests = []
  const suites = []
  for (const suite of report?.testResults ?? []) {
    const failed = (suite.assertionResults ?? []).filter(t => t.status === 'failed')
    for (const t of failed) tests.push({ file: suite.name, test: t.fullName ?? t.title })
    if (suite.status === 'failed' && failed.length === 0) suites.push(suite.name)
  }
  return { tests, suites }
}

/**
 * @returns {{ block: boolean, reason: string, quarantined: object[], blocking: object[] }}
 * `rc` = code de sortie du lanceur de tests ; `report` = rapport JSON (ou null s'il manque).
 */
export function decide({ report, rc, quarantine }) {
  if (rc === 0) return { block: false, reason: 'tests verts', quarantined: [], blocking: [] }
  if (!report || !Array.isArray(report.testResults))
    return { block: true, reason: 'rapport absent ou illisible', quarantined: [], blocking: [] }
  const { tests, suites } = failedTests(report)
  if (tests.length === 0 || suites.length > 0)
    return {
      block: true,
      reason: suites.length > 0 ? 'suite en échec sans test nommé' : 'échec sans test rouge identifié',
      quarantined: [],
      blocking: suites.map(file => ({ file, test: '(suite)' })),
    }
  const isQuarantined = t => quarantine.some(q => sameFile(t.file, q.file) && q.test === t.test)
  const quarantined = tests.filter(isQuarantined)
  const blocking = tests.filter(t => !isQuarantined(t))
  return {
    block: blocking.length > 0,
    reason: blocking.length > 0 ? 'test rouge hors quarantaine' : 'tous les tests rouges sont en quarantaine',
    quarantined,
    blocking,
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const [cmd, ...rest] = process.argv.slice(2)
  const opt = name => rest[rest.indexOf(`--${name}`) + 1]
  if (cmd === 'active') {
    process.exit(readQuarantine().length > 0 ? 0 : 1)
  } else if (cmd === 'decide') {
    let report = null
    try {
      report = JSON.parse(readFileSync(opt('report'), 'utf8'))
    } catch {
      /* rapport absent : decide() bloque */
    }
    const result = decide({ report, rc: Number(opt('rc')), quarantine: readQuarantine() })
    for (const t of result.quarantined)
      console.log(
        `::warning title=Test en quarantaine::${t.file} › ${t.test} est rouge mais en quarantaine (tools/ci/quarantine.json)`,
      )
    for (const t of result.blocking) console.log(`::error::${t.file} › ${t.test} : ${result.reason}`)
    if (result.blocking.length === 0 && result.block) console.log(`::error::${result.reason}`)
    process.exit(result.block ? 1 : 0)
  } else {
    console.error('usage : quarantine.mjs active | decide --report <json> --rc <n>')
    process.exit(2)
  }
}
