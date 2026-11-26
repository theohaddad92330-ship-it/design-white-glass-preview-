import type { CommercialBrief } from '@bellum/contracts'

import type { Conversion } from './brief-engine'
import type { AccountPlan } from './plan-types'

export type AccountReport = {
  plan: AccountPlan
  conversion: Conversion
  brief: CommercialBrief
  violations: number
  json: string
}

const cell = (value: string | number | undefined): string =>
  String(value ?? '')
    .replace(/\|/g, '\\|')
    .replace(/\n/g, ' ')

const roleCounts = (brief: CommercialBrief): string => {
  const counts = new Map<string, number>()
  for (const person of brief.people) counts.set(person.role ?? '—', (counts.get(person.role ?? '—') ?? 0) + 1)
  return [...counts.entries()]
    .sort()
    .map(([role, n]) => `${role} ${n}`)
    .join(' · ')
}

/** README généré par le convertisseur (jamais écrit à la main : il reste vrai tant que le convertisseur tourne). */
export const renderReadme = (reports: readonly AccountReport[]): string => {
  const out: string[] = []
  out.push('# Briefs commerciaux des comptes (données de la salle démo)')
  out.push('')
  out.push(
    'Fichier GÉNÉRÉ par `pnpm --filter @bellum/api convert:commercial-brief` — ne pas éditer à la main. ' +
      'Source : classeurs xlsx écrits à la main par le CEO (`agent_docs/sources/briefs-comptes-2026-10-01/`, puis `…-10-04/` pour Naval Group et Chantiers de l’Atlantique ; hors dépôt). ' +
      'Contrat : `packages/contracts/src/schemas/commercial-brief.ts`, contrôles : `checkCommercialBrief`. ' +
      'Le convertisseur échoue (code ≠ 0, aucun fichier écrit) sur tout onglet non mappé, toute colonne lue sans être déclarée, ' +
      'toute violation du schéma ou des contrôles métier. ' +
      'Exception : les DOSSIERS DE COMPTE déposés par le CEO — Orange (12/10/2026), Crédit Agricole, VINCI, Enedis et Safran (15/10/2026) — (JSON + CSV de contacts + sources, hors dépôt) sont convertis par `pnpm --filter @bellum/api convert:account-dossier -- --account <slug> --source-dir <pack>` (cœur partagé `account-dossier.ts`, un mapping par compte) — mêmes schéma et contrôles ; toute clé du dossier est mappée ou écartée avec sa raison ; seules les adresses du domaine du groupe sont reprises, les autres sont comptées parmi les valeurs écartées ; l’ESN prospect de chaque démo (Soluxan, MK4 Technova, Experis, JEMS) n’est jamais nommée.',
  )
  out.push('')
  out.push(
    'Règles tranchées (Louis / CEO, 01/10/2026 ; 04/10/2026 pour NGen) : « OneSide », « NGen », « Thélio », « Les Pertinents » et « Alpineo » (ESN prospects) neutralisés · aucune donnée de notre propre performance ·',
  )
  out.push(
    'périmètres sortis marqués `exited` (Equans chez ENGIE, Treezor chez SG, Reichshoffen chez Alstom) · France uniquement, sauf ABB Suisse (périmètre `suisse`, décision Louis 04/10/2026 : sites et entités en CH, jamais mêlés à la France) · BPCE = UN compte, couche Toulouse ajoutée (`toulouse-…`, `cockpit-toulouse`) · coordonnées recopiées en clair, jamais inventées.',
  )
  out.push('')
  out.push('| Compte | Fichier | Taille | personnes | entités | sites | esn | prix | sections | violations |')
  out.push('| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |')
  for (const { plan, brief, json, violations } of reports) {
    out.push(
      `| ${plan.name} | \`${plan.slug}.json\` | ${(json.length / 1024).toFixed(0)} Ko | ${brief.people.length} | ${brief.entities.length} | ${brief.sites.length} | ${brief.esn.length} | ${brief.prices.length} | ${brief.sections.length} | ${violations} |`,
    )
  }
  for (const { plan, brief, conversion } of reports) {
    out.push('')
    out.push(
      `## ${plan.name} — ${[plan.source, ...(plan.layers ?? []).map(layer => layer.source)].map(file => `\`${file}\``).join(' + ')}`,
    )
    out.push('')
    const exitedPeople = brief.people.filter(p => p.exited === true).length
    out.push(
      `Siège : ${brief.headquarters.label}, ${brief.headquarters.city}. Personnes : ${roleCounts(brief)}` +
        (exitedPeople ? ` (dont ${exitedPeople} \`exited\`)` : '') +
        '.',
    )
    out.push('')
    out.push('| Onglet | Champ du contrat | Lignes | Note |')
    out.push('| --- | --- | --- | --- |')
    for (const line of conversion.coverage) {
      out.push(`| ${cell(line.sheet)} | ${cell(line.field)} | ${line.rows} | ${cell(line.note)} |`)
    }
    const skipped = Object.entries(conversion.skipped).sort()
    if (skipped.length) {
      out.push('')
      out.push('Valeurs écartées (jamais recopiées) :')
      for (const [reason, n] of skipped) out.push(`- ${n} × ${reason}`)
    }
    if (conversion.anomalies.length) {
      out.push('')
      out.push('Anomalies de la SOURCE (gardées telles quelles, à corriger dans le classeur) :')
      for (const anomaly of conversion.anomalies) out.push(`- ${anomaly}`)
    }
  }
  out.push('')
  return out.join('\n')
}

type ParsedReadme = { head: string[]; tableHead: string[]; rows: Map<string, string>; sections: Map<string, string[]> }

/** Découpe un README généré : en-tête, tableau récapitulatif (une ligne par compte), sections « ## <compte> — … ». */
const parseReadme = (text: string): ParsedReadme => {
  const lines = text.replace(/\n$/, '').split('\n')
  const tableAt = lines.findIndex(l => l.startsWith('| Compte |'))
  if (tableAt < 0) throw new Error('README sans tableau récapitulatif')
  const rows = new Map<string, string>()
  let at = tableAt + 2
  for (; at < lines.length && lines[at].startsWith('| '); at += 1) rows.set(lines[at].split('|')[1].trim(), lines[at])
  const sections = new Map<string, string[]>()
  let current: string[] | undefined
  for (const line of lines.slice(at)) {
    const heading = /^## (.+?) — /.exec(line)
    if (heading) {
      current = []
      sections.set(heading[1], current)
    }
    current?.push(line)
  }
  for (const section of sections.values()) while (section[section.length - 1] === '') section.pop()
  return { head: lines.slice(0, tableAt), tableHead: lines.slice(tableAt, tableAt + 2), rows, sections }
}

/**
 * `--only <slug>` : fusionne dans le README existant les seuls comptes convertis — les autres entrées (tableau et
 * sections) restent byte-identiques ; un compte déjà présent est remplacé à sa place, jamais doublé.
 */
export const mergeReadme = (existing: string, reports: readonly AccountReport[]): string => {
  const base = parseReadme(existing)
  const fresh = parseReadme(renderReadme(reports))
  const rows = new Map([...base.rows, ...fresh.rows])
  const sections = new Map([...base.sections, ...fresh.sections])
  const out = [...fresh.head, ...fresh.tableHead, ...rows.values()]
  for (const section of sections.values()) out.push('', ...section)
  out.push('')
  return out.join('\n')
}
