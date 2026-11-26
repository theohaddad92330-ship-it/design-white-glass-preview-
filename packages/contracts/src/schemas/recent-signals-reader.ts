// ── Le lecteur UNIQUE de `recent_signals` (#3928.a) ──────────────────────────
// Deux projections du même blob vivaient côte à côte : la veille d'un compte
// (`buildAccountWatchData`, web) et le flux du portefeuille
// (`toAccountSignalItems` → `listAccountSignals`, API — Mes cibles et Laura).
// Elles ne lisaient ni le même libellé (`signal` d'un côté, `title` de l'autre),
// ni la même règle de doublon. Une seule lecture désormais : chaque écran
// (veille, Mes cibles, Découvrir, cloche, Laura) part de `readRecentSignals`,
// puis ajoute SA présentation — jamais une seconde lecture du blob (GA-26).

import { classifyTemporalStatus, signalDateMs } from './account.js'
import { dropInternshipRows } from './internship-posting.js'
import { resolveSignalSourceLink } from './signal-source-link.js'

/**
 * L'ordre de lecture du libellé : `signal` d'abord, la clé que le pipeline
 * écrit réellement (`offer_provenance.py`, #3920) — le MÊME ordre que
 * `signal_history` (`signal-history.projection.ts`), qui indexe l'historique
 * sur ce libellé : deux ordres différents rataient la jointure.
 */
const LABEL_FIELDS = ['signal', 'title', 'label', 'description', 'summary'] as const
const FRESHNESS_VALUES = new Set(['current', 'archive', 'undated'])

export type ReadRecentSignal = {
  /** La position dans la liste BRUTE — les identifiants stables des écrans en dérivent. */
  index: number
  /** #2687 — l'identifiant posé par l'analyse (« s1 »), cité par les hypothèses. */
  id: string | null
  label: string
  type: string | null
  date: string | null
  source: string | null
  /** #3922 — l'URL http(s) vérifiable, ou `null` : jamais devinée. */
  source_url: string | null
  source_kind: string | null
  freshness: 'current' | 'archive' | 'undated' | null
  temporal_status: string | null
  sales_implication: string | null
  impact: string | null
  /** #4020 / #4022 — le lieu d'une offre d'emploi, tel que le collecteur l'a lu ; `null` = inconnu, jamais deviné. */
  location: string | null
  /** #4733.2 — recrutement d'un dirigeant, drapeau posé par l'IA ; `false` = non posé, jamais deviné. */
  executive_role: boolean
  /** #4182.5 — le dossier « qui demande ce profil ? » posé par la collecte sur une offre ; `null` = non composé. */
  requester: Record<string, unknown> | null
  /** #4437.5 — le rattachement d'une OFFRE (compétences, famille, type de fait, extrait lu) ; `null` = non posé. */
  offer_attachment: OfferAttachment | null
  tags: string[]
}

/** #4437.5 — `unclassified` = l'intitulé ne nomme rien : « non classé », jamais une famille devinée. */
type OfferAttachment = {
  status: 'attached' | 'unclassified'
  fact_type: string | null
  skills: string[]
  job_family: string | null
  extract: string | null
}

function readOfferAttachment(value: unknown): OfferAttachment | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const record = value as Record<string, unknown>
  const status = record['status']
  if (status !== 'attached' && status !== 'unclassified') return null
  return {
    status,
    fact_type: text(record['fact_type']),
    skills: Array.isArray(record['skills'])
      ? record['skills'].filter((skill): skill is string => typeof skill === 'string' && skill.trim().length > 0)
      : [],
    job_family: text(record['job_family']),
    extract: text(record['extract']),
  }
}

function text(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null
}

function firstText(record: Record<string, unknown>, keys: readonly string[]): string | null {
  for (const key of keys) {
    const value = text(record[key])
    if (value) return value
  }
  return null
}

function readOne(value: unknown, index: number): ReadRecentSignal | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const record = value as Record<string, unknown>
  const label = firstText(record, LABEL_FIELDS)
  if (!label) return null
  const link = resolveSignalSourceLink({
    url: text(record['url']),
    source_kind: firstText(record, ['source_kind', 'sourceKind']),
  })
  const freshness = text(record['freshness'])
  return {
    index,
    id: text(record['id']),
    label,
    type: text(record['type']),
    date: text(record['date']),
    source: text(record['source']),
    source_url: link.kind === 'link' ? link.url : null,
    source_kind: link.kind === 'link' ? link.sourceKind : null,
    freshness: freshness && FRESHNESS_VALUES.has(freshness) ? (freshness as ReadRecentSignal['freshness']) : null,
    temporal_status: firstText(record, ['temporal_status', 'temporalStatus']),
    // #1424 — les deux orthographes : le blob IA (`salesImplication`) et le semis (`sales_implication`).
    sales_implication: firstText(record, ['sales_implication', 'salesImplication']),
    impact: text(record['impact']),
    location: text(record['location']),
    executive_role: record['executive_role'] === true,
    requester:
      record['requester'] && typeof record['requester'] === 'object' && !Array.isArray(record['requester'])
        ? (record['requester'] as Record<string, unknown>)
        : null,
    offer_attachment: readOfferAttachment(record['offer_attachment']),
    tags: Array.isArray(record['tags'])
      ? record['tags'].filter((tag): tag is string => typeof tag === 'string' && tag.trim().length > 0)
      : [],
  }
}

/**
 * #3928.a — `recent_signals` (colonne, ou `raw_analysis.recent_signals`) lu UNE
 * fois pour tous les écrans. Une ligne sans libellé ne fait aucune ligne
 * (« on n'affiche pas ce qu'on n'a pas ») ; un même fait (même libellé, même
 * source) ne s'affiche qu'une fois.
 */
export function readRecentSignals(raw: unknown): ReadRecentSignal[] {
  if (!Array.isArray(raw)) return []
  const read: ReadRecentSignal[] = []
  raw.forEach((value, index) => {
    const signal = readOne(value, index)
    if (!signal) return
    // #4044 — une offre de STAGE ne devient JAMAIS un signal (décision Louis 12/10) : le lecteur unique
    // l'écarte pour tous les écrans, les signaux DÉJÀ stockés compris. L'index brut reste celui de la liste.
    if (dropInternshipRows([value], { jobsOnly: true }).length === 0) return
    // #4294.6 — le même fait, dit deux fois (titre quasi identique, même source ou date proche), n'est lu qu'une fois.
    if (read.some(kept => isSameSignalFact(kept, signal))) return
    read.push(signal)
  })
  return read
}

/** #4294.6 — le titre sans casse, accents ni ponctuation : « Veolia : après 20 % de baisse… » = « VEOLIA apres 20 de baisse ». */
function normalizeSignalLabel(label: string): string {
  return label
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

const SAME_FACT_WINDOW_MS = 7 * 24 * 3600 * 1000

/**
 * #4294.6 (#4142.5) — deux lignes disent-elles le même fait ? Même titre normalisé, ET (même source, ou une
 * source absente d'un côté, ou deux dates à moins d'une semaine). Un même titre à des dates et sources éloignées
 * (deux levées de fonds) reste deux faits.
 */
function isSameSignalFact(
  a: Pick<ReadRecentSignal, 'label' | 'source' | 'date'>,
  b: Pick<ReadRecentSignal, 'label' | 'source' | 'date'>,
): boolean {
  const label = normalizeSignalLabel(a.label)
  if (label.length === 0 || label !== normalizeSignalLabel(b.label)) return false
  const sourceA = a.source ? normalizeSignalLabel(a.source) : ''
  const sourceB = b.source ? normalizeSignalLabel(b.source) : ''
  if (sourceA === '' || sourceB === '' || sourceA === sourceB) return true
  const dateA = signalDateMs(a.date)
  const dateB = signalDateMs(b.date)
  return dateA !== null && dateB !== null && Math.abs(dateA - dateB) <= SAME_FACT_WINDOW_MS
}

/**
 * #4294.6 — la MÊME règle à l'écriture, sur la liste BRUTE : les lignes gardées gardent leur forme (aucun champ
 * réécrit), la première de chaque fait gagne, et une ligne illisible passe telle quelle (ce n'est pas à ce
 * filtre de la juger). Une valeur qui n'est pas une liste est rendue inchangée.
 */
export function dedupeNearIdenticalSignals<T>(raw: T): T {
  if (!Array.isArray(raw)) return raw
  const kept: ReadRecentSignal[] = []
  const out = raw.filter((value, index) => {
    const signal = readOne(value, index)
    if (!signal) return true
    if (kept.some(earlier => isSameSignalFact(earlier, signal))) return false
    kept.push(signal)
    return true
  })
  return out as unknown as T
}

/**
 * #3928.1 — « un signal sans date n'est pas récent », la MÊME règle pour tous
 * les écrans (l'axe score l'appliquait seul, `account_score_axes.py`). Récent =
 * `RECENT` ou `CURRENT_VERIFIED` au sens de {@link classifyTemporalStatus} ;
 * sans date ni fraîcheur lisible (`UNDATED`/`null`), archivé, ou disparu de la
 * dernière analyse : non.
 */
export function isRecentSignal(
  signal: Parameters<typeof classifyTemporalStatus>[0],
  nowMs: number = Date.now(),
): boolean {
  // #3928.2 — un tampon (`RECENT` posé par l'IA, vérification humaine) ne remplace
  // PAS la date : BlaBlaCar « nouvelles fonctionnalités… » passait dans « ce qui
  // bouge » de Laura sans date. Sans date lisible, jamais récent, nulle part.
  if (signalDateMs(signal.date) === null) return false
  const status = classifyTemporalStatus(signal, nowMs)
  return status === 'RECENT' || status === 'CURRENT_VERIFIED'
}
