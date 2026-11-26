import { spawn } from 'node:child_process'
import { existsSync, readdirSync, statSync } from 'node:fs'
import { basename, join } from 'node:path'
import dataSource from '../database/data-source'
import { parseImportToutArgs, planImportTout, runImportTout, type ImportToutStep } from './import-tout-plan'

/**
 * Lot 783 (#5205) — le SCRIPT UNIQUE opérateur : toutes les données en une commande (README de
 * `scripts/market-v2/` pour la commande `railway run` exacte).
 *
 *   pnpm --filter @bellum/api import:tout <pack v2.1> <pack v1 bellum-data-freelances-2022> <ORION_DATAPACK_V12> [--dry-run]
 *
 * Le plan, l'ordre et l'arrêt au premier échec : `import-tout-plan.ts`. Chaque étape est l'importeur existant, lancé
 * tel quel (`pnpm run <script>`), sa sortie affichée en direct ; le rapport final reprend ses lignes chiffrées.
 */
const API_ROOT = join(__dirname, '..', '..')
const SUMMARY_LINES = 12

function findFile(dir: string, prefix: string): string | null {
  const matches: string[] = []
  const walk = (current: string): void => {
    for (const entry of readdirSync(current)) {
      const full = join(current, entry)
      if (statSync(full).isDirectory()) walk(full)
      else if (entry.startsWith(prefix) && entry.toLowerCase().endsWith('.csv')) matches.push(full)
    }
  }
  walk(dir)
  return matches.find(m => basename(m) === `${prefix}.csv`) ?? matches.sort()[0] ?? null
}

function runScript(step: Extract<ImportToutStep, { kind: 'script' }>): Promise<{ ok: boolean; summary: string[] }> {
  return new Promise(resolve => {
    const child = spawn('pnpm', ['run', '--silent', step.script, ...step.args], {
      cwd: API_ROOT,
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    const tail: string[] = []
    const keep = (chunk: Buffer, out: NodeJS.WriteStream): void => {
      out.write(chunk)
      for (const line of chunk.toString('utf8').split('\n')) {
        // Les dernières lignes utiles (volumes, raison d'un arrêt) ; pas la bannière de dotenv.
        if (line.trim().length > 0 && !line.startsWith('◇')) tail.push(line.trim())
        if (tail.length > SUMMARY_LINES) tail.shift()
      }
    }
    child.stdout.on('data', (chunk: Buffer) => keep(chunk, process.stdout))
    child.stderr.on('data', (chunk: Buffer) => keep(chunk, process.stderr))
    child.on('error', error => resolve({ ok: false, summary: [`lancement impossible : ${error.message}`] }))
    child.on('close', code => resolve({ ok: code === 0, summary: [...tail, `code de sortie ${code ?? 'inconnu'}`] }))
  })
}

/** La couverture, lue en base après l'import : des COMPTES de lignes, jamais une valeur. */
async function readCoverage(): Promise<{ ok: boolean; summary: string[] }> {
  await dataSource.initialize()
  try {
    const count = async (sql: string): Promise<string> =>
      String(((await dataSource.query(sql)) as { n: string | number }[])[0]?.n ?? 0)
    const v2 = (await dataSource.query(
      `SELECT count(*) AS tables, coalesce(sum(rows_written), 0) AS rows, coalesce(sum(rows_rejected), 0) AS rejected
         FROM market_v2_datasets
        WHERE dataset_version = (SELECT dataset_version FROM market_v2_datasets ORDER BY loaded_at DESC LIMIT 1)`,
    )) as { tables: string; rows: string; rejected: string }[]
    const needs = (await dataSource.query(
      `SELECT source_file, count(*) AS n FROM dataforge_needs GROUP BY source_file ORDER BY source_file`,
    )) as { source_file: string; n: string }[]
    return {
      ok: true,
      summary: [
        `pack v2.1 (dernière version) : ${v2[0]?.tables ?? 0}/139 tables, ${v2[0]?.rows ?? 0} lignes, ${v2[0]?.rejected ?? 0} rejetées`,
        `market_person_paths : ${await count('SELECT count(*) AS n FROM market_person_paths')} (dont dérivés de positions v2.1 : ${await count(`SELECT count(*) AS n FROM market_person_paths WHERE corpus_label = 'market_v2'`)})`,
        `common_account_links (référentiel pivot) : ${await count('SELECT count(*) AS n FROM common_account_links')} liens, ${await count('SELECT count(DISTINCT common_id) AS n FROM common_account_links')} entreprises (dont reliées BM-A ↔ DF : ${await count('SELECT count(DISTINCT common_id) AS n FROM common_account_links WHERE bm_account_id IS NOT NULL AND dataforge_source_id IS NOT NULL')})`,
        `dataforge_account_statuses (ORION 10) : ${await count('SELECT count(*) AS n FROM dataforge_account_statuses')}`,
        ...needs.map(n => `dataforge_needs ${n.source_file} : ${n.n}`),
        `dataforge_rag_chunks (ORION 50) : ${await count('SELECT count(*) AS n FROM dataforge_rag_chunks')}`,
      ],
    }
  } finally {
    await dataSource.destroy()
  }
}

async function main(): Promise<void> {
  const args = parseImportToutArgs(process.argv.slice(2))
  if ('error' in args) {
    console.error(args.error)
    process.exitCode = 1
    return
  }
  const absent = [args.v2, args.v1, args.orion].filter(dir => !existsSync(dir) || !statSync(dir).isDirectory())
  if (absent.length > 0) {
    console.error(`Dossier(s) introuvable(s) : ${absent.join(', ')} — aucune étape lancée.`)
    process.exitCode = 1
    return
  }
  const plan = planImportTout(args, findFile)
  if ('error' in plan) {
    console.error(plan.error)
    process.exitCode = 1
    return
  }
  for (const note of plan.notes) console.log(note)
  const result = await runImportTout(
    plan.steps,
    args.dryRun,
    step => (step.kind === 'coverage' ? readCoverage() : runScript(step)),
    line => console.log(line),
  )
  if (!result.ok) process.exitCode = 1
}

void main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : 'échec inconnu')
  process.exitCode = 1
})
