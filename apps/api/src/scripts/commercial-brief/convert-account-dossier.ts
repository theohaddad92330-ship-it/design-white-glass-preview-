import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'

import { checkCommercialBrief, commercialBriefSchema, type CommercialBrief } from '@bellum/contracts'

import type { JsonObject } from './account-dossier'
import { ACCOUNT_DOSSIERS } from './account-dossiers'
import { mergeReadme, type AccountReport } from './brief-readme'
import type { AccountPlan } from './plan-types'

/**
 * Convertisseur des DOSSIERS DE COMPTE déposés par le CEO (Orange 12/10, Crédit Agricole / VINCI / Enedis / Safran 15/10).
 *
 *   pnpm --filter @bellum/api convert:account-dossier -- --account <slug> --source-dir <dossier du pack>
 *
 * Le pack contient `data/<compte>_account.json`, `data/contacts_<compte>.csv` et `data/sources.csv` (hors dépôt). Même
 * contrat de sortie que `convert:commercial-brief` : code ≠ 0 et AUCUN fichier écrit dès qu'une donnée n'a pas de case,
 * que le schéma zod est violé ou qu'un contrôle métier (`checkCommercialBrief`) relève quelque chose. Le README des
 * briefs est FUSIONNÉ : seules les lignes du compte converti changent.
 */

const OUT_DIR = resolve(__dirname, '../../modules/demo/data/commercial-briefs')

const argValue = (flag: string): string | undefined => {
  const at = process.argv.indexOf(flag)
  return at >= 0 ? process.argv[at + 1] : undefined
}

/** Même mise en page que les autres briefs : un objet de premier niveau par ligne, un élément de tableau par ligne. */
const serialize = (brief: CommercialBrief): string => {
  const lines = Object.entries(brief).map(([key, value]) => {
    if (Array.isArray(value) && value.length > 0) {
      return ` ${JSON.stringify(key)}: [\n${value.map(item => `  ${JSON.stringify(item)}`).join(',\n')}\n ]`
    }
    return ` ${JSON.stringify(key)}: ${JSON.stringify(value)}`
  })
  return `{\n${lines.join(',\n')}\n}\n`
}

const main = (): void => {
  const slug = argValue('--account') ?? 'orange'
  const dossier = ACCOUNT_DOSSIERS.find(candidate => candidate.slug === slug)
  const sourceDir = argValue('--source-dir') ?? process.env.ACCOUNT_DOSSIER_DIR ?? process.env.ORANGE_DOSSIER_DIR
  if (!dossier || !sourceDir) {
    console.error(
      `✗ --account <${ACCOUNT_DOSSIERS.map(d => d.slug).join('|')}> et --source-dir <dossier du pack> sont obligatoires`,
    )
    process.exitCode = 1
    return
  }
  const data = join(resolve(sourceDir), 'data')
  const account = JSON.parse(readFileSync(join(data, dossier.accountFile), 'utf8')) as JsonObject
  const conversion = dossier.convert({
    account,
    contactsCsv: readFileSync(join(data, dossier.contactsFile), 'utf8'),
    sourcesCsv: readFileSync(join(data, 'sources.csv'), 'utf8'),
  })

  const failures: string[] = []
  const parsed = commercialBriefSchema.safeParse(conversion.brief)
  if (!parsed.success) {
    for (const issue of parsed.error.issues.slice(0, 20))
      failures.push(`schéma : ${issue.path.join('.')} — ${issue.message}`)
  } else {
    for (const violation of checkCommercialBrief(parsed.data)) {
      failures.push(`${violation.code} ${violation.path} — ${violation.message}`)
    }
  }
  if (failures.length > 0 || !parsed.success) {
    console.error(`✗ ${failures.length} violation(s) — aucun fichier écrit :`)
    for (const failure of failures.slice(0, 60)) console.error(`  ${failure}`)
    process.exitCode = 1
    return
  }

  const json = serialize(parsed.data)
  // Le README fusionne une « entrée de compte » : seules les propriétés lues par le rendu sont renseignées.
  const plan = {
    slug: dossier.slug,
    name: dossier.name,
    source: `${dossier.accountFile} + ${dossier.contactsFile} + sources.csv`,
  } as AccountPlan
  const report: AccountReport = { plan, conversion, brief: parsed.data, violations: 0, json }

  writeFileSync(join(OUT_DIR, `${dossier.slug}.json`), json)
  console.log(`✓ ${dossier.slug}.json — ${(json.length / 1024).toFixed(0)} Ko, ${parsed.data.people.length} personnes`)
  const readmePath = join(OUT_DIR, 'README.md')
  if (existsSync(readmePath)) {
    writeFileSync(readmePath, mergeReadme(readFileSync(readmePath, 'utf8'), [report]))
    console.log(`✓ README.md (ligne et section ${dossier.name})`)
  }
  for (const anomaly of conversion.anomalies) console.log(`  ⚠ ${anomaly}`)
}

main()
