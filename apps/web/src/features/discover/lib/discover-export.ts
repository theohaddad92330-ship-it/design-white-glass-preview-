import { toCsv } from '@/lib/csv'
import type { DiscoverCandidate } from './discover-types'
import { isHighPotential, scoreRatio } from './discover-ranking'

/* ------------------------------------------------------------------ */
/*  Export de la liste de résultats (maquette p.20, en-tête).           */
/*                                                                     */
/*  Un export ne doit contenir que ce que l'écran a réellement reçu :   */
/*  aucune colonne dérivée d'une supposition, aucun champ « estimé ».   */
/*  Un score non mesurable sort VIDE, pas à 0 — le fichier quitte       */
/*  l'application et devient une source à son tour.                    */
/* ------------------------------------------------------------------ */

/** Colonnes, dans l'ordre. Chacune est un champ du contrat Découvrir. */
export const DISCOVER_EXPORT_COLUMNS = [
  'name',
  'siren',
  'nafCode',
  'sector',
  'city',
  'department',
  'headcount',
  'created',
  'score',
  'scoreMax',
  'confidence',
  'highPotential',
  'signals',
  'lastSignal',
  'portfolio',
  'sources',
] as const
type DiscoverExportColumn = (typeof DISCOVER_EXPORT_COLUMNS)[number]

/** Libellés d'en-tête, résolus par l'appelant (i18n FR/EN). */
export type DiscoverExportLabels = Record<DiscoverExportColumn, string> & {
  /** Rendu de `highPotential`. */
  yes: string
  no: string
  /** Rendu de `portfolio` — état résolu côté API. */
  portfolioState: Record<DiscoverCandidate['portfolioState'], string>
  /**
   * #1912.11 — un identifiant de source → sa CAPACITÉ (`dataSourceLabel`).
   * Résolu par l'appelant, qui seul tient `t`. Le fichier quitte l'application
   * et se lit dans un tableur : il est une surface client comme l'écran, et la
   * colonne portait `pappers` — le nom de NOTRE fournisseur, qui ne se nomme
   * jamais. C'est le JUMEAU non-JSX du défaut des cartes de /discover.
   */
  dataSourceLabel: (name: string) => string
}

/** Date du signal le plus récent (ISO court), ou `''`. */
function lastSignalDate(candidate: DiscoverCandidate): string {
  let latest = ''
  for (const signal of candidate.signals) {
    if (Number.isNaN(Date.parse(signal.date))) continue
    if (latest === '' || signal.date > latest) latest = signal.date
  }
  return latest.slice(0, 10)
}

function row(candidate: DiscoverCandidate, labels: DiscoverExportLabels): string[] {
  const scored = scoreRatio(candidate) !== null
  return [
    candidate.name,
    candidate.siren,
    candidate.nafCode ?? '',
    candidate.sector ?? '',
    candidate.city ?? '',
    candidate.department ?? '',
    candidate.headcountRange ?? '',
    candidate.creationDate ?? '',
    scored ? String(candidate.score) : '',
    scored ? String(candidate.scoreMax) : '',
    candidate.dataConfidence === null ? '' : String(candidate.dataConfidence),
    isHighPotential(candidate) ? labels.yes : labels.no,
    String(candidate.signals.length),
    lastSignalDate(candidate),
    labels.portfolioState[candidate.portfolioState],
    // Dédoublonné comme à l'écran : deux fournisseurs d'une même capacité n'en font qu'une.
    [...new Set(candidate.sources.map(source => labels.dataSourceLabel(source.name)))].join(' · '),
  ]
}

/** Liste rendue → CSV, dans l'ordre exact où elle est affichée. */
export function discoverCsv(candidates: readonly DiscoverCandidate[], labels: DiscoverExportLabels): string {
  const headers = DISCOVER_EXPORT_COLUMNS.map(column => labels[column])
  return toCsv([headers, ...candidates.map(candidate => row(candidate, labels))])
}

/** `decouvrir-2026-07-22.csv` — daté, parce qu'un export vieillit. */
export function discoverExportFilename(prefix: string, nowMs: number = Date.now()): string {
  return `${prefix}-${new Date(nowMs).toISOString().slice(0, 10)}.csv`
}
