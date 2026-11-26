// ── Le lecteur de `raw_analysis.signal_layers` (#4760, lot HIST-F) ───────────
// L'IA range les signaux en trois couches (`visible` / `more` / `historical`) et,
// depuis #4760, les OFFRES d'emploi aussi (`jobOffers`). La clé était calculée,
// testée, et lue par personne : un fait de 2021 ou une offre de huit mois ne
// pouvait donc jamais être NOMMÉ comme besoin historique. Ce lecteur est le
// point d'entrée unique côté TypeScript — l'API, la web et Laura partent de lui.

type HistoricalNeed = {
  label: string
  /** La date telle que la collecte l'a lue ; `null` = non datée, jamais inventée. */
  date: string | null
  /** La fenêtre de fraîcheur qui a classé ce fait `archive` ; `null` = inconnue. */
  windowDays: number | null
  /** Lot 771 — ce que la ligne de la couche portait déjà et que le lecteur jetait : lien, compétences, TJM, nature. */
  url?: string
  technologies?: string[]
  tjmEur?: number
  /** La nature que la collecte a posée (`recrutement`, `projet`…) ; absente = inconnue. */
  kind?: string
  /** `true` = la ligne porte une implication commerciale lue par l'analyse. */
  commercial?: boolean
}

function textOf(value: unknown): string | null {
  return typeof value === 'string' && value.trim() !== '' ? value.trim() : null
}

export type ReadSignalLayers = {
  historicalSignals: HistoricalNeed[]
  historicalJobOffers: HistoricalNeed[]
  /** `null` = la clé n'existe pas (analyse antérieure) : « non mesuré », jamais 0. */
  historicalCount: number | null
}

const LABEL_FIELDS = ['signal', 'title', 'label', 'description', 'summary'] as const

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : null
}

function readHistorical(layer: Record<string, unknown> | null): HistoricalNeed[] | null {
  const rows = layer?.['historical']
  if (!Array.isArray(rows)) return null
  const out: HistoricalNeed[] = []
  for (const row of rows) {
    const record = asRecord(row)
    if (!record) continue
    const label = LABEL_FIELDS.map(field => record[field]).find(v => typeof v === 'string' && v.trim() !== '')
    if (typeof label !== 'string') continue
    const date = record['date']
    const windowDays = record['freshness_window_days'] ?? record['freshnessWindowDays']
    const need: HistoricalNeed = {
      label: label.trim(),
      date: typeof date === 'string' && date.trim() !== '' ? date : null,
      windowDays: typeof windowDays === 'number' && Number.isFinite(windowDays) ? windowDays : null,
    }
    const url = textOf(record['url'])
    if (url) need.url = url
    const rawSkills = record['skills'] ?? record['technologies']
    const technologies = Array.isArray(rawSkills) ? rawSkills.map(textOf).filter((v): v is string => v !== null) : []
    if (technologies.length > 0) need.technologies = technologies
    const tjm = record['tjm_eur'] ?? record['tjmEur']
    if (typeof tjm === 'number' && Number.isFinite(tjm) && tjm > 0) need.tjmEur = tjm
    const kind = textOf(record['type'])
    if (kind) need.kind = kind
    if (textOf(record['sales_implication'])) need.commercial = true
    out.push(need)
  }
  return out
}

/** Lit `raw_analysis.signal_layers` (snake_case, tel que l'API le persiste) ou `signalLayers` (IA brute). */
export function readSignalLayers(rawAnalysis: unknown): ReadSignalLayers {
  const raw = asRecord(rawAnalysis)
  const layers = asRecord(raw?.['signal_layers'] ?? raw?.['signalLayers'])
  const signals = readHistorical(layers)
  const offers = readHistorical(asRecord(layers?.['job_offers'] ?? layers?.['jobOffers']))
  return {
    historicalSignals: signals ?? [],
    historicalJobOffers: offers ?? [],
    historicalCount: signals === null && offers === null ? null : (signals?.length ?? 0) + (offers?.length ?? 0),
  }
}

/** D'où vient un besoin historique : un signal rangé en archive, ou une offre d'emploi de plus de 180 jours. */
/** Lot 775 — `market_path` : une mission observée sur le marché (mémoire marché), sans identité. */
export type HistoricalNeedSource = 'signal' | 'job_offer' | 'market_path'

export type HistoricalNeedItem = {
  label: string
  /** La date RÉELLE du fait, telle que la source l'a donnée ; `null` = non datée (jamais une date devinée). */
  date: string | null
  source: HistoricalNeedSource
  /** Lot 771 — le lien de l'offre, ses compétences et son TJM quand la collecte les a lus ; absents = rien. */
  url?: string
  technologies?: string[]
  tjm_eur?: number
  /** Lot 775 — le lieu de la mission observée (jamais l'adresse d'une personne). */
  location?: string
}

/** Ce que le dossier d'analyse porte sous `raw_analysis.historical_needs` (#4760). */
export type HistoricalNeedsBlock = {
  total: number
  items: HistoricalNeedItem[]
}

function itemOf(need: HistoricalNeed, source: HistoricalNeedSource): HistoricalNeedItem {
  return {
    label: need.label,
    date: need.date,
    source,
    ...(need.url ? { url: need.url } : {}),
    ...(need.technologies ? { technologies: need.technologies } : {}),
    ...(need.tjmEur ? { tjm_eur: need.tjmEur } : {}),
  }
}

/**
 * #4760 — les besoins historiques NOMMÉS du dossier : libellé, date réelle, source, plus le total.
 *
 * Aucune probabilité, aucun score. `null` quand il n'y a rien à nommer (clé absente OU couches sans
 * historique) : une absence ne fait AUCUNE ligne et ne devient jamais un total « 0 » (GA-18 / GA-19).
 * Les plus récents d'abord ; les non datés ferment la liste.
 */
export function buildHistoricalNeeds(read: ReadSignalLayers): HistoricalNeedsBlock | null {
  const items: HistoricalNeedItem[] = [
    ...read.historicalJobOffers.map(need => itemOf(need, 'job_offer')),
    ...read.historicalSignals.map(need => itemOf(need, 'signal')),
  ]
  if (items.length === 0) return null
  items.sort((a, b) => {
    if (a.date === b.date) return 0
    if (a.date === null) return 1
    if (b.date === null) return -1
    return a.date < b.date ? 1 : -1
  })
  return { total: items.length, items }
}
