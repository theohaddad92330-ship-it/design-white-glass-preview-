import { mkdirSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'

import { checkMarketBrief, marketBriefSchema, type MarketBrief } from '@bellum/contracts'

import { readWorkbook } from '../commercial-brief/xlsx-grid'
import { convertMarketWorkbook } from './market-engine'
import { MARKET_PLANS } from './market-plans'
import { renderMarketReadme } from './market-readme'

type MarketConversion = ReturnType<typeof convertMarketWorkbook>

/**
 * Convertisseur des briefs de MARCHÉ (capacité « Marchés locaux », lot L5, 05/10/2026) : 3 classeurs xlsx écrits à la
 * main (`MARCHE_LILLE_MEEDZ`, `MARCHE_NANTES_SAINT_NAZAIRE`, `META_MARCHE_LYON_SUISSE`) → 4 objets `MarketBrief`
 * (`apps/api/src/modules/demo/data/market-briefs/<slug>.json`) + README de couverture. 0 appel réseau, 0 appel LLM.
 *
 *   pnpm --filter @bellum/api convert:market-brief [-- --source-dir <dossier des xlsx>]
 *
 * Code de sortie ≠ 0 dès qu'un onglet n'est pas mappé, qu'une colonne est lue sans être déclarée, qu'un brief viole le
 * schéma zod OU un contrôle métier (`checkMarketBrief`) — et alors AUCUN fichier n'est écrit.
 */

const REPO_ROOT = resolve(__dirname, '../../../../..')
const DEFAULT_SOURCE = join(REPO_ROOT, 'agent_docs/sources/briefs-comptes-2026-10-04')
const OUT_DIR = resolve(__dirname, '../../modules/demo/data/market-briefs')

const argValue = (flag: string): string | undefined => {
  const at = process.argv.indexOf(flag)
  return at >= 0 ? process.argv[at + 1] : undefined
}

/** Un objet de premier niveau par ligne, un élément de tableau par ligne : relisible et diffable. */
const serialize = (brief: MarketBrief): string => {
  const lines = Object.entries(brief).map(([key, value]) => {
    if (Array.isArray(value) && value.length > 0) {
      return ` ${JSON.stringify(key)}: [\n${value.map(item => `  ${JSON.stringify(item)}`).join(',\n')}\n ]`
    }
    return ` ${JSON.stringify(key)}: ${JSON.stringify(value)}`
  })
  return `{\n${lines.join(',\n')}\n}\n`
}

const main = async (): Promise<void> => {
  const sourceDir = resolve(argValue('--source-dir') ?? process.env.BRIEFS_SOURCE_DIR ?? DEFAULT_SOURCE)
  const failures: string[] = []
  const reports: { slug: string; brief: MarketBrief; conversion: MarketConversion; json: string }[] = []

  for (const plan of MARKET_PLANS) {
    let conversion: MarketConversion
    try {
      conversion = convertMarketWorkbook(await readWorkbook(join(sourceDir, plan.source)), plan)
    } catch (error) {
      failures.push(error instanceof Error ? error.message : String(error))
      continue
    }
    const parsed = marketBriefSchema.safeParse(conversion.brief)
    if (!parsed.success) {
      for (const issue of parsed.error.issues.slice(0, 20)) {
        failures.push(`[${plan.slug}] schéma : ${issue.path.join('.')} — ${issue.message}`)
      }
      continue
    }
    for (const violation of checkMarketBrief(parsed.data)) {
      failures.push(`[${plan.slug}] ${violation.code} ${violation.path} — ${violation.message}`)
    }
    reports.push({ slug: plan.slug, brief: parsed.data, conversion, json: serialize(parsed.data) })
  }

  if (failures.length > 0) {
    console.error(`✗ ${failures.length} violation(s) — aucun fichier écrit :`)
    for (const failure of failures.slice(0, 60)) console.error(`  ${failure}`)
    process.exitCode = 1
    return
  }

  mkdirSync(OUT_DIR, { recursive: true })
  for (const report of reports) {
    writeFileSync(join(OUT_DIR, `${report.slug}.json`), report.json)
    const b = report.brief
    console.log(
      `✓ ${report.slug}.json — ${(report.json.length / 1024).toFixed(0)} Ko, ${b.clients?.length ?? 0} clients, ${b.esn.length} ESN, ${b.people.length} personnes`,
    )
  }
  writeFileSync(join(OUT_DIR, 'README.md'), renderMarketReadme(reports))
  console.log('✓ README.md (rapport de couverture)')
}

void main()
