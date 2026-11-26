import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'

import { checkCommercialBrief, commercialBriefSchema, type CommercialBrief } from '@bellum/contracts'

import { ACCOUNT_PLANS } from './account-plans'
import { convertWorkbook, type Conversion } from './brief-engine'
import { applyLayer } from './brief-layer'
import { mergeReadme, renderReadme, type AccountReport } from './brief-readme'
import type { AccountPlan } from './plan-types'
import { readWorkbook } from './xlsx-grid'

/**
 * Convertisseur des briefs commerciaux (chantier « briefs comptes », 01/10/2026) :
 * 5 classeurs xlsx écrits à la main par le CEO → 5 objets `CommercialBrief`
 * (`apps/api/src/modules/demo/data/commercial-briefs/<slug>.json`) + README de couverture.
 *
 *   pnpm --filter @bellum/api convert:commercial-brief [-- --source-dir <dossier des xlsx>]
 *
 * Le code de sortie est ≠ 0 dès qu'un onglet n'est pas mappé, qu'une colonne est
 * lue sans être déclarée, qu'un brief viole le schéma zod OU un contrôle métier
 * (`checkCommercialBrief`) — et alors AUCUN fichier n'est écrit.
 */

const REPO_ROOT = resolve(__dirname, '../../../../..')
const DEFAULT_SOURCE = join(REPO_ROOT, 'agent_docs/sources/briefs-comptes-2026-10-01')
const OUT_DIR = resolve(__dirname, '../../modules/demo/data/commercial-briefs')

const argValue = (flag: string): string | undefined => {
  const at = process.argv.indexOf(flag)
  return at >= 0 ? process.argv[at + 1] : undefined
}

/** Un objet de premier niveau par ligne, un élément de tableau par ligne : relisible et diffable. */
const serialize = (brief: CommercialBrief): string => {
  const lines = Object.entries(brief).map(([key, value]) => {
    if (Array.isArray(value) && value.length > 0) {
      return ` ${JSON.stringify(key)}: [\n${value.map(item => `  ${JSON.stringify(item)}`).join(',\n')}\n ]`
    }
    return ` ${JSON.stringify(key)}: ${JSON.stringify(value)}`
  })
  return `{\n${lines.join(',\n')}\n}\n`
}

const main = async (): Promise<void> => {
  // Un dossier explicite (--source-dir / BRIEFS_SOURCE_DIR) vaut pour tous les comptes ; sinon chaque plan porte le sien
  // (`sourceDir`, démo clients 04/10/2026), à défaut le dossier historique du 01/10/2026.
  const explicitDir = argValue('--source-dir') ?? process.env.BRIEFS_SOURCE_DIR
  const reports: AccountReport[] = []
  const failures: string[] = []

  // `--only <slug>[,<slug>]` : ne convertit ni n'écrit que ces comptes ; le README est FUSIONNÉ (les autres entrées
  // restent byte-identiques). Sans `--only`, tout est converti et le README régénéré en entier.
  const only = argValue('--only')
    ?.split(',')
    .map(s => s.trim())
    .filter(Boolean)
  const unknown = (only ?? []).filter(slug => !ACCOUNT_PLANS.some(plan => plan.slug === slug))
  if (unknown.length > 0) {
    console.error(
      `✗ --only : compte(s) inconnu(s) ${unknown.join(', ')} (connus : ${ACCOUNT_PLANS.map(p => p.slug).join(', ')})`,
    )
    process.exitCode = 1
    return
  }
  const plans = only ? ACCOUNT_PLANS.filter(plan => only.includes(plan.slug)) : ACCOUNT_PLANS

  for (const plan of plans) {
    let conversion: Conversion
    try {
      const sourceDir = explicitDir
        ? resolve(explicitDir)
        : plan.sourceDir
          ? join(REPO_ROOT, 'agent_docs/sources', plan.sourceDir)
          : DEFAULT_SOURCE
      const supplements = await Promise.all(
        (plan.supplements ?? []).map(async supplement => ({
          grid: await readWorkbook(join(sourceDir, supplement.source)),
          plan: supplement,
        })),
      )
      conversion = convertWorkbook(await readWorkbook(join(sourceDir, plan.source)), plan, supplements)
      // Couches du compte (BPCE + Toulouse) : un second classeur, converti à part puis AJOUTÉ au brief du compte.
      for (const layer of plan.layers ?? []) {
        const layerPlan: AccountPlan = {
          ...plan,
          slug: `${plan.slug}-${layer.key}`,
          titlePrefix: layer.titlePrefix,
          source: layer.source,
          rewrites: layer.rewrites,
          sheets: layer.sheets,
          layer: true,
          layers: undefined,
          derivedEntities: undefined,
          derivedSites: undefined,
          derivedPrices: undefined,
        }
        const layerConversion = convertWorkbook(await readWorkbook(join(sourceDir, layer.source)), layerPlan)
        conversion = applyLayer(conversion, layerConversion, layer)
      }
    } catch (error) {
      failures.push(`[${plan.slug}] ${error instanceof Error ? error.message : String(error)}`)
      continue
    }
    const parsed = commercialBriefSchema.safeParse(conversion.brief)
    if (!parsed.success) {
      for (const issue of parsed.error.issues.slice(0, 20)) {
        failures.push(`[${plan.slug}] schéma : ${issue.path.join('.')} — ${issue.message}`)
      }
      continue
    }
    const violations = checkCommercialBrief(parsed.data)
    for (const violation of violations) {
      failures.push(`[${plan.slug}] ${violation.code} ${violation.path} — ${violation.message}`)
    }
    reports.push({ plan, conversion, brief: parsed.data, violations: violations.length, json: serialize(parsed.data) })
  }

  if (failures.length > 0) {
    console.error(`✗ ${failures.length} violation(s) — aucun fichier écrit :`)
    for (const failure of failures.slice(0, 60)) console.error(`  ${failure}`)
    if (failures.length > 60) console.error(`  … et ${failures.length - 60} autre(s)`)
    process.exitCode = 1
    return
  }

  mkdirSync(OUT_DIR, { recursive: true })
  for (const report of reports) {
    writeFileSync(join(OUT_DIR, `${report.plan.slug}.json`), report.json)
    console.log(
      `✓ ${report.plan.slug}.json — ${(report.json.length / 1024).toFixed(0)} Ko, ${report.brief.people.length} personnes`,
    )
  }
  const readmePath = join(OUT_DIR, 'README.md')
  // Le README est FUSIONNÉ dès qu'il existe, même sans `--only` : le compte Orange (dossier JSON + CSV du 12/10/2026,
  // `convert:orange-dossier`) n'est pas un classeur xlsx et ne doit pas disparaître d'une régénération complète.
  writeFileSync(
    readmePath,
    existsSync(readmePath) ? mergeReadme(readFileSync(readmePath, 'utf8'), reports) : renderReadme(reports),
  )
  console.log('✓ README.md (rapport de couverture)')
}

void main()
