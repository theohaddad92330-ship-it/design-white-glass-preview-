import { dropInternshipRows } from '@bellum/contracts'
import {
  NEEDS_HISTORY_AGGREGATE_TOP_TECHS,
  NEEDS_HISTORY_DEFAULT_ROWS_PER_CALL,
  NEEDS_HISTORY_MAX_ROWS_PER_CALL,
} from './needs-history.limits'

/**
 * #4759 — un besoin (offre d'emploi) passé d'un compte, tel que Laura le lit.
 *
 * ⚠️ `date` est la date RÉELLE de l'offre, `null` quand la source n'en donne pas : Laura ne cite alors
 * AUCUNE date (`ageLabel` le dit). `ageLabel` est calculé ICI, une fois : le modèle ne soustrait jamais
 * deux dates. Une offre archivée / retombée reste utilisable, son âge est dit.
 * Aucun corps de message, aucun critère protégé : titre, lieu, techno, contrat, date, source.
 */
export type NeedRow = {
  title: string
  date: string | null
  ageDays: number | null
  ageLabel: string
  city: string | null
  department: string | null
  contractType: string | null
  skills: string[]
  source: string | null
  /** `false` = l'offre n'est plus dans la dernière analyse (retombée) — elle reste un besoin vu. */
  stillListed: boolean
}

export type NeedsFilter = {
  tech?: string
  zone?: string
  since?: string
  until?: string
  limit?: number
  offset?: number
}

export type NeedsAggregate = {
  count: number
  topTechs: string[]
  /** `null` = aucune offre datée : pas de période affirmée. */
  periodFrom: string | null
  periodTo: string | null
  lastNeedAt: string | null
  lastNeedAgeLabel: string | null
  undatedCount: number
}

const DAY_MS = 86_400_000
const ISO_DAY = /^(\d{4})-(\d{2})-(\d{2})/
const FR_MONTHS = [
  'janvier',
  'février',
  'mars',
  'avril',
  'mai',
  'juin',
  'juillet',
  'août',
  'septembre',
  'octobre',
  'novembre',
  'décembre',
]

const norm = (value: string): string => value.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim()

const text = (value: unknown): string | null => (typeof value === 'string' && value.trim() !== '' ? value.trim() : null)

/** « 2026-08-10… » ou « juillet 2026 » → `YYYY-MM-DD` ; sinon `null` (jamais une date devinée). */
export function parseNeedDate(raw: unknown): string | null {
  const value = text(raw)
  if (!value) return null
  const iso = ISO_DAY.exec(value)
  if (iso) {
    const day = `${iso[1]}-${iso[2]}-${iso[3]}`
    return Number.isNaN(Date.parse(day)) ? null : day
  }
  const fr = /^([a-zéû]+)\s+(\d{4})$/i.exec(value)
  if (fr) {
    const month = FR_MONTHS.indexOf((fr[1] ?? '').toLowerCase())
    if (month >= 0) return `${fr[2]}-${String(month + 1).padStart(2, '0')}-01`
  }
  return null
}

/** L'âge DIT, jamais à recalculer : « il y a 11 mois », « date inconnue ». */
export function ageLabelOf(ageDays: number | null): string {
  if (ageDays === null) return 'date de l’offre inconnue'
  if (ageDays < 0) return 'date à venir'
  if (ageDays < 14) return ageDays <= 1 ? 'il y a moins de 2 jours' : `il y a ${ageDays} jours`
  if (ageDays < 60) return `il y a ${Math.floor(ageDays / 7)} semaines`
  if (ageDays < 730) return `il y a ${Math.floor(ageDays / 30)} mois`
  return `il y a ${Math.floor(ageDays / 365)} ans`
}

function toRow(raw: Record<string, unknown>, now: Date, stillListed: boolean): NeedRow | null {
  const title = text(raw['title'])
  if (!title) return null
  const date = parseNeedDate(raw['date'])
  const ageDays = date ? Math.floor((now.getTime() - Date.parse(date)) / DAY_MS) : null
  const skills = Array.isArray(raw['skills'])
    ? raw['skills'].filter((s): s is string => typeof s === 'string' && s.trim() !== '').map(s => s.trim())
    : []
  return {
    title,
    date,
    ageDays,
    ageLabel: ageLabelOf(ageDays),
    city: text(raw['city']),
    department: text(raw['department']),
    contractType: text(raw['contract_type']),
    skills,
    source: text(raw['source']),
    stillListed,
  }
}

/**
 * Fusionne les offres du dossier (`raw_analysis.it_job_signals`, listées) et les lignes de recrutement de
 * `signal_history` (retombées comprises : une offre archivée EST utilisable). Dédoublonne sur titre + date,
 * les offres du dossier gagnent. Les offres de stage ne sont jamais un besoin (#4044).
 */
export function collectNeeds(args: {
  jobSignals: unknown
  history: { label: string; signal_date: string | null; status: string }[]
  now: Date
}): NeedRow[] {
  const rows: NeedRow[] = []
  const seen = new Set<string>()
  const push = (row: NeedRow | null): void => {
    if (!row) return
    const key = `${norm(row.title)}|${row.date ?? ''}`
    if (seen.has(key)) return
    seen.add(key)
    rows.push(row)
  }
  for (const job of dropInternshipRows(args.jobSignals)) {
    if (job && typeof job === 'object') push(toRow(job as Record<string, unknown>, args.now, true))
  }
  const historyRows = dropInternshipRows(args.history.map(h => ({ title: h.label, contractType: null }))) as {
    title: string
  }[]
  const kept = new Set(historyRows.map(h => h.title))
  for (const h of args.history) {
    if (!kept.has(h.label)) continue
    push(toRow({ title: h.label, date: h.signal_date }, args.now, h.status === 'active'))
  }
  return rows.sort((a, b) => (b.date ?? '').localeCompare(a.date ?? ''))
}

export function clampLimit(limit: number | undefined): number {
  if (limit === undefined || !Number.isFinite(limit)) return NEEDS_HISTORY_DEFAULT_ROWS_PER_CALL
  return Math.min(Math.max(Math.trunc(limit), 1), NEEDS_HISTORY_MAX_ROWS_PER_CALL)
}

export function filterNeeds(rows: NeedRow[], filter: NeedsFilter): NeedRow[] {
  const tech = filter.tech ? norm(filter.tech) : null
  const zone = filter.zone ? norm(filter.zone) : null
  return rows.filter(row => {
    if (tech && !norm([row.title, ...row.skills].join(' ')).includes(tech)) return false
    if (zone && !norm([row.city, row.department].filter(Boolean).join(' ')).includes(zone)) return false
    // Une période demandée écarte les offres sans date : on ne PRÉTEND pas qu'elles y tombent.
    if (filter.since && (row.date === null || row.date < filter.since)) return false
    if (filter.until && (row.date === null || row.date > filter.until)) return false
    return true
  })
}

export function aggregateNeeds(rows: NeedRow[]): NeedsAggregate {
  const dated = rows.filter((r): r is NeedRow & { date: string } => r.date !== null)
  const counts = new Map<string, number>()
  for (const row of rows) for (const skill of row.skills) counts.set(skill, (counts.get(skill) ?? 0) + 1)
  const topTechs = [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, NEEDS_HISTORY_AGGREGATE_TOP_TECHS)
    .map(([skill]) => skill)
  const dates = dated.map(r => r.date).sort()
  const last = dated.length ? dated.reduce((a, b) => (a.date >= b.date ? a : b)) : null
  return {
    count: rows.length,
    topTechs,
    periodFrom: dates[0] ?? null,
    periodTo: dates[dates.length - 1] ?? null,
    lastNeedAt: last?.date ?? null,
    lastNeedAgeLabel: last?.ageLabel ?? null,
    undatedCount: rows.length - dated.length,
  }
}

/** Le texte du contexte : daté, borné, et il DIT où l'historique complet se lit. Rien si aucun besoin. */
export function needsAggregateLine(agg: NeedsAggregate): string | null {
  if (agg.count === 0) return null
  const parts = [`${agg.count} besoin${agg.count > 1 ? 's' : ''} d’emploi vu${agg.count > 1 ? 's' : ''} (historique)`]
  if (agg.periodFrom && agg.periodTo) parts.push(`période couverte ${agg.periodFrom} → ${agg.periodTo}`)
  if (agg.lastNeedAt) parts.push(`dernier besoin vu le ${agg.lastNeedAt} (${agg.lastNeedAgeLabel})`)
  if (agg.undatedCount > 0) parts.push(`${agg.undatedCount} sans date connue`)
  parts.push(agg.topTechs.length ? `technos dominantes : ${agg.topTechs.join(', ')}` : 'technos non renseignées')
  parts.push('détail à la demande via l’outil historique des besoins')
  return parts.join(' — ')
}
