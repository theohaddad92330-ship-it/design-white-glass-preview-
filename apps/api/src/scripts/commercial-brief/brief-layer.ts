import type { CommercialBrief } from '@bellum/contracts'

import type { Conversion } from './brief-engine'
import type { LayerPlan } from './plan-types'

/**
 * Couche d'un compte (démo Thélio 06/10/2026 : BPCE + Toulouse) : UN seul compte, la couche AJOUTE à la base du groupe.
 * Le brief répond à « BPCE » ET à « BPCE à Toulouse » — jamais à la place l'un de l'autre :
 *  - personnes : une personne déjà connue (même nom, ordre des mots ignoré) est COMPLÉTÉE (la base gagne sur ses champs
 *    remplis, la couche remplit les vides, le rôle le plus fort est gardé) ; une personne neuve reçoit le département
 *    de la couche ;
 *  - entités et sites : ajoutés seulement s'ils sont absents (un site se reconnaît à sa VILLE : un second « Balma »
 *    n'apporte rien) ;
 *  - garde-fous : ajoutés, préfixés « <label> — » ;
 *  - sections : toutes rangées sous `<key>-…` ; le cockpit de la couche devient la section `cockpit-<key>` (le cockpit
 *    du groupe — kpis, what_i_know, charts — reste celui de la base).
 */

type Person = NonNullable<CommercialBrief['people']>[number]
type Section = CommercialBrief['sections'][number]

const norm = (value: string | undefined): string =>
  (value ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
const nameKey = (name: string): string => norm(name).split(' ').filter(Boolean).sort().join(' ')

const RANK: Record<NonNullable<Person['role']>, number> = {
  contact: 0,
  manager: 1,
  decision_maker: 2,
  external: -1,
  alumni: -1,
}
const rank = (role: Person['role']): number => (role ? RANK[role] : -2)

const cockpitSection = (layer: CommercialBrief, plan: LayerPlan): Section => {
  const rows: Section['rows'] = [
    ...layer.kpis.map(kpi => ({
      bloc: 'Indicateur',
      rubrique: kpi.label,
      ce_que_je_sais: kpi.value,
      ...(kpi.caption ? { ce_que_ca_veut_dire: kpi.caption } : {}),
    })),
    ...layer.what_i_know.map(row => ({
      bloc: 'Ce que je sais — en une page',
      rubrique: row.rubric,
      ce_que_je_sais: row.known,
      ce_que_ca_veut_dire: row.meaning,
    })),
    ...layer.charts.flatMap(chart =>
      chart.items.map(item => ({
        bloc: `Graphique — ${chart.title}`,
        rubrique: item.label,
        ce_que_je_sais: item.value,
      })),
    ),
  ]
  return {
    key: `cockpit-${plan.key}`,
    title: `Cockpit ${plan.label} — tout ce que je sais`,
    columns: [
      { key: 'bloc', label: 'BLOC' },
      { key: 'rubrique', label: 'RUBRIQUE' },
      { key: 'ce_que_je_sais', label: 'CE QUE JE SAIS' },
      { key: 'ce_que_ca_veut_dire', label: 'CE QUE ÇA VEUT DIRE POUR TOI' },
    ],
    rows,
  }
}

export const applyLayer = (base: Conversion, layer: Conversion, plan: LayerPlan): Conversion => {
  const b = base.brief
  const l = layer.brief

  // ── personnes ──
  const people: Person[] = b.people.map(p => ({ ...p }))
  const byName = new Map<string, Person>()
  for (const person of people) if (!byName.has(nameKey(person.name))) byName.set(nameKey(person.name), person)
  let added = 0
  let merged = 0
  for (const incoming of l.people) {
    const target = byName.get(nameKey(incoming.name))
    if (target) {
      const record = target as Record<string, unknown>
      for (const [key, value] of Object.entries(incoming)) {
        if (key === 'name' || key === 'role') continue
        if (record[key] === undefined || record[key] === '') record[key] = value
      }
      if (rank(incoming.role) > rank(target.role)) target.role = incoming.role
      merged += 1
    } else {
      const person: Person = { ...incoming, department: incoming.department ?? plan.department }
      people.push(person)
      byName.set(nameKey(person.name), person)
      added += 1
    }
  }

  // ── entités, sites, ESN, prix : seulement ce qui est absent ──
  const entities = [...b.entities]
  for (const entity of l.entities) if (!entities.some(e => norm(e.name) === norm(entity.name))) entities.push(entity)
  const sites = [...b.sites]
  for (const site of l.sites) {
    if (!sites.some(s => norm(s.city) === norm(site.city) || norm(s.name) === norm(site.name))) sites.push(site)
  }
  const esn = [...b.esn]
  for (const item of l.esn) if (!esn.some(e => norm(e.name) === norm(item.name))) esn.push(item)
  const prices = [...b.prices, ...l.prices]

  // ── garde-fous préfixés ──
  const guardrails = [
    ...b.guardrails,
    ...l.guardrails.map(g => ({ point: `${plan.label} — ${g.point}`, detail: g.detail })),
  ]

  // ── sections : toutes sous `<key>-…`, puis le cockpit de la couche ──
  const prefix = `${plan.key}-`
  const sections: Section[] = [
    ...b.sections,
    ...l.sections.map(section => ({
      ...section,
      key: section.key.startsWith(prefix) ? section.key : `${prefix}${section.key}`,
      ...(section.key === 'notes' ? { title: `Notes des onglets — ${plan.label}` } : {}),
    })),
    cockpitSection(l, plan),
  ]
  const keys = sections.map(s => s.key)
  const duplicate = keys.find((key, i) => keys.indexOf(key) !== i)
  if (duplicate) throw new Error(`[couche ${plan.key}] clé de section en double : ${duplicate}`)

  const skipped = { ...base.skipped }
  for (const [reason, n] of Object.entries(layer.skipped)) skipped[reason] = (skipped[reason] ?? 0) + n

  return {
    brief: { ...b, entities, sites, prices, esn, people, sections, guardrails } as CommercialBrief,
    coverage: [
      ...base.coverage,
      ...layer.coverage.map(line => ({ ...line, sheet: `[${plan.label}] ${line.sheet}` })),
      {
        sheet: `[${plan.label}] (couche)`,
        field: 'people',
        rows: added + merged,
        note: `${added} ajoutée(s), ${merged} fusionnée(s) dans une personne déjà listée du groupe`,
      },
    ],
    skipped,
    anomalies: [...base.anomalies, ...layer.anomalies.map(a => `[${plan.label}] ${a}`)],
  }
}
