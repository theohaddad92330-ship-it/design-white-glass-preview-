import { locationInZone, type ZoneGeo } from './zone-accounts'

/**
 * Capacité « Marchés locaux » (L1) — la grille de prix métier × séniorité d'une zone.
 *
 * DÉTERMINISTE et scopée : l'appelant ne passe que les besoins et missions de
 * l'espace courant (GA-43 : les espaces sont des concurrents, aucun prix d'un
 * autre n'entre jamais ici). Rien n'est estimé :
 * - n < 3 ⇒ la cellule (ou la ligne) est ABSENTE, jamais un zéro ni un chiffre mince ;
 * - un TJM absent ou nul n'est pas un échantillon ;
 * - une famille qu'on ne sait pas nommer n'est pas rangée dans « autres ».
 * - une zone suisse n'a PAS de grille : les tarifs de l'espace sont en euros et le
 *   contrat veut du CHF pour la Suisse ; convertir serait inventer un taux.
 *
 * Forme = `price_grid` de `marketBriefSchema` (@bellum/contracts), pour que L3 la
 * pose telle quelle dans le brief.
 */

const MIN_SAMPLE = 3

type NeedRow = {
  title: string | null
  seniority: string | null
  target_tjm_cents: string | null
  location: string | null
  account_id: string
}
type MissionRow = { role_title: string | null; daily_rate: number | null; location: string | null; account_id: string }

type Level = 'junior' | 'confirmed' | 'senior'
type Cell = { amount: number; n: number }
type PriceRow = {
  family: string
  needs: number
  median: number
  junior?: Cell
  confirmed?: Cell
  senior?: Cell
  range: { min: number; max: number }
}
export type DeterministicPriceGrid = {
  currency: 'EUR'
  period: string
  sample_size: number
  source_kind: 'own_needs_missions'
  top_client?: { name: string; n: number }
  rows: PriceRow[]
}

const fold = (value: string): string => value.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()

/** Familles de métiers ESN ; l'ordre tranche (premier match gagne). */
const FAMILIES: readonly (readonly [string, RegExp])[] = [
  ['Cybersécurité', /securit|cyber|pentest|soc\b|rssi/],
  ['Data / BI', /\bdata\b|\bbi\b|big data|analyste donn|power bi|machine learning|\bia\b|datascien/],
  ['Cloud / DevOps', /devops|\bcloud\b|sre\b|kubernetes|\baws\b|azure|infrastructure|systeme|reseau/],
  ['ERP / SAP', /\bsap\b|\berp\b|salesforce|dynamics|odoo/],
  ['Test / QA', /\btest|\bqa\b|recette|qualite logiciel/],
  ['Architecture', /architecte|architecture/],
  [
    'Gestion de projet / PMO',
    /chef de projet|project manager|\bpmo\b|scrum master|product owner|\bmoa\b|\bamoa\b|agile coach/,
  ],
  [
    'Développement',
    /develop|dev\b|\bfullstack|full stack|front.?end|back.?end|java|\.net|python|react|angular|php|ingenieur logiciel|programmeur/,
  ],
]

export const familyOf = (title: string | null | undefined): string | null => {
  if (!title) return null
  const t = fold(title)
  return FAMILIES.find(([, pattern]) => pattern.test(t))?.[0] ?? null
}

/** `expert` se range avec `senior` : le contrat n'a que trois niveaux. */
const levelOf = (seniority: string | null): Level | null => {
  if (!seniority) return null
  const s = fold(seniority).trim()
  if (/junior|debutant/.test(s)) return 'junior'
  if (/confirm|intermediaire/.test(s)) return 'confirmed'
  if (/senior|expert/.test(s)) return 'senior'
  return null
}

const median = (values: number[]): number => {
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 1 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2
}

type Sample = { family: string; level: Level | null; euros: number; clientId: string }

export const buildPriceGrid = (input: {
  zone: ZoneGeo
  needs: NeedRow[]
  missions: MissionRow[]
  accountNames: ReadonlyMap<string, string>
  period: string
}): DeterministicPriceGrid | null => {
  const { zone, needs, missions, accountNames, period } = input
  if (zone.scope !== 'france') return null

  const samples: Sample[] = []
  for (const need of needs) {
    const family = familyOf(need.title)
    const cents = need.target_tjm_cents === null ? NaN : Number(need.target_tjm_cents)
    if (!family || !Number.isFinite(cents) || cents <= 0 || !locationInZone(need.location, zone)) continue
    samples.push({ family, level: levelOf(need.seniority), euros: cents / 100, clientId: need.account_id })
  }
  for (const mission of missions) {
    const family = familyOf(mission.role_title)
    const rate = mission.daily_rate
    if (!family || rate === null || !Number.isFinite(rate) || rate <= 0 || !locationInZone(mission.location, zone))
      continue
    samples.push({ family, level: null, euros: rate, clientId: mission.account_id })
  }

  const byFamily = new Map<string, Sample[]>()
  for (const sample of samples) byFamily.set(sample.family, [...(byFamily.get(sample.family) ?? []), sample])

  const rows: PriceRow[] = []
  const kept: Sample[] = []
  for (const [family, group] of byFamily) {
    if (group.length < MIN_SAMPLE) continue
    kept.push(...group)
    const row: PriceRow = {
      family,
      needs: group.length,
      median: Math.round(median(group.map(s => s.euros))),
      range: {
        min: Math.round(Math.min(...group.map(s => s.euros))),
        max: Math.round(Math.max(...group.map(s => s.euros))),
      },
    }
    for (const level of ['junior', 'confirmed', 'senior'] as const) {
      const cell = group.filter(s => s.level === level)
      if (cell.length >= MIN_SAMPLE) row[level] = { amount: Math.round(median(cell.map(s => s.euros))), n: cell.length }
    }
    rows.push(row)
  }
  if (rows.length === 0) return null
  rows.sort((a, b) => b.needs - a.needs || a.family.localeCompare(b.family))

  const perClient = new Map<string, number>()
  for (const sample of kept) perClient.set(sample.clientId, (perClient.get(sample.clientId) ?? 0) + 1)
  const [topId, topN] = [...perClient.entries()].sort((a, b) => b[1] - a[1])[0] ?? []
  const topName = topId ? accountNames.get(topId) : undefined

  return {
    currency: 'EUR',
    period,
    sample_size: kept.length,
    source_kind: 'own_needs_missions',
    ...(topName && topN ? { top_client: { name: topName, n: topN } } : {}),
    rows,
  }
}
