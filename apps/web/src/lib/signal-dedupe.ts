import { parseSignalDate, type RecentSignal, type SignalDateValue } from '@bellum/contracts'

/**
 * #4142 — LE prédicat « quasi-doublon » de la liste de signaux du dossier (GA-26 : un seul endroit, partagé par
 * tous les rendus). Un même fait écrit deux fois, avec deux formulations, ne fait qu'UNE ligne — la plus riche
 * gardée (lien, date, détail). Rien n'est supprimé en base : seul le rendu replie.
 *
 * Deux signaux sont le même fait quand :
 *  · même LIEN (hôte + chemin, sans paramètres de suivi) ET même jour, à ± {@link SIGNAL_DATE_WINDOW_DAYS} jour ; ou
 *  · TEXTE très proche (normalisé, similarité ≥ {@link SIGNAL_TEXT_SIMILARITY_THRESHOLD}) ET dates COMPATIBLES.
 * Une date inconnue n'autorise jamais la fusion par le lien ; deux dates connues et éloignées ne fusionnent jamais
 * (un fait qui se répète deux mois plus tard n'est pas un doublon).
 */
export const SIGNAL_TEXT_SIMILARITY_THRESHOLD = 0.8
export const SIGNAL_DATE_WINDOW_DAYS = 1

export type DedupableSignal = {
  text: string
  url?: string | null | undefined
  /** La date telle que la source la porte (prose ou ISO) ; `null` = inconnue. */
  date?: string | null | undefined
  /** Le détail que la ligne porte en plus du titre (raison, description…) : sert à départager, jamais à comparer. */
  detail?: string | null | undefined
}

const MS_PER_DAY = 86_400_000

const normalizeText = (value: string): string[] =>
  value
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .split(' ')
    .filter(token => token.length > 1)

/** Similarité de Dice sur les mots normalisés (0 = rien de commun, 1 = mêmes mots). */
export function signalTextSimilarity(a: string, b: string): number {
  const left = new Set(normalizeText(a))
  const right = new Set(normalizeText(b))
  if (left.size === 0 || right.size === 0) return 0
  let common = 0
  for (const token of left) if (right.has(token)) common += 1
  return (2 * common) / (left.size + right.size)
}

const normalizeUrl = (url: string | null | undefined): string | null => {
  if (!url) return null
  try {
    const parsed = new URL(url)
    return `${parsed.hostname.replace(/^www\./, '')}${parsed.pathname.replace(/\/+$/, '')}`.toLowerCase()
  } catch {
    return null
  }
}

const dayNumber = (value: SignalDateValue): number | null =>
  value.kind === 'day' ? Math.floor(Date.UTC(value.year, value.month - 1, value.day) / MS_PER_DAY) : null

type DateRelation = 'close' | 'far' | 'unknown'

/** Deux dates : voisines (± fenêtre), éloignées, ou non comparables. Jamais une date devinée. */
function relateDates(a: string | null | undefined, b: string | null | undefined): DateRelation {
  const left = parseSignalDate(a)
  const right = parseSignalDate(b)
  if (left.kind === 'unknown' || right.kind === 'unknown') return 'unknown'
  const leftDay = dayNumber(left)
  const rightDay = dayNumber(right)
  if (leftDay !== null && rightDay !== null) {
    return Math.abs(leftDay - rightDay) <= SIGNAL_DATE_WINDOW_DAYS ? 'close' : 'far'
  }
  // Précision plus large que le jour : seule l'égalité de valeur dit « même date ».
  return JSON.stringify(left) === JSON.stringify(right) ? 'close' : 'far'
}

export function areNearDuplicateSignals(
  a: DedupableSignal,
  b: DedupableSignal,
  options: { sameSourceOnly?: boolean } = {},
): boolean {
  const dates = relateDates(a.date, b.date)
  const urlA = normalizeUrl(a.url)
  const urlB = normalizeUrl(b.url)
  if (urlA !== null && urlA === urlB && dates === 'close') return true
  if (options.sameSourceOnly) return false
  return dates !== 'far' && signalTextSimilarity(a.text, b.text) >= SIGNAL_TEXT_SIMILARITY_THRESHOLD
}

/** La richesse d'une ligne : lien, date, détail — la plus riche survit au repli. */
const richness = (signal: DedupableSignal): number =>
  (normalizeUrl(signal.url) ? 2 : 0) +
  (parseSignalDate(signal.date).kind === 'unknown' ? 0 : 1) +
  Math.min((signal.detail ?? '').trim().length, 400) / 400

/**
 * Replie les quasi-doublons : l'ordre est conservé, la ligne la plus riche prend la place de la première
 * occurrence. `sameSourceOnly` (listes d'enjeux) : seul un lien commun fusionne, jamais le texte seul.
 */
export function dedupeSignals<T>(
  items: readonly T[],
  read: (item: T) => DedupableSignal,
  options: { sameSourceOnly?: boolean } = {},
): T[] {
  const kept: T[] = []
  for (const item of items) {
    const signal = read(item)
    const index = kept.findIndex(existing => areNearDuplicateSignals(read(existing), signal, options))
    if (index === -1) {
      kept.push(item)
    } else if (richness(signal) > richness(read(kept[index] as T))) {
      kept[index] = item
    }
  }
  return kept
}

/**
 * La liste de signaux du dossier (`recent_signals`), repliée par le même prédicat partout où elle se rend ou se
 * compte (« Signaux » / « Pourquoi maintenant », pastille de la synthèse) : la pastille ne dit jamais 7 devant six lignes.
 */
export function dedupeRecentSignals<T extends RecentSignal>(signals: readonly T[]): T[] {
  return dedupeSignals(signals, signal => ({
    text: signal.signal ?? '',
    url: signal.url,
    date: signal.date,
    detail: signal.selection_reason ?? signal.type,
  }))
}

/**
 * #4294.10 (#4142.5) — DEUX OFFRES AU MÊME INTITULÉ, DANS DEUX VILLES, SONT UNE LIGNE (« 2 offres (Toulouse, Aix) »).
 * Le cas réel (Thales) : « Senior Consultant Stratégie DATA / IA » et « Senior consultant Stratégie Data et IA ».
 * L'intitulé se compare normalisé — casse, accents, ponctuation, « et » / « / » / « & » ignorés. Seules les offres
 * (`source_kind` = `job`) se replient ainsi : un fait de presse répété n'est pas une offre multi-sites. Les villes
 * absentes ne s'inventent pas : elles ne figurent pas dans la liste.
 */
// K3 (recette 22/10) — LE prédicat « c'est une offre d'emploi », UN seul (GA-26) : la catégorie « recrutement » de la
// veille (`watchData.categoryFor`) ET le pli des offres au même intitulé le partagent. Avant, le pli exigeait
// `source_kind === 'job'` alors que la catégorie l'accordait aussi par type ou par nom de source : la même offre
// s'affichait 3 fois (« Measurement and Data Marketing Manager », 3/11).
const JOB_TYPE_ALIASES: ReadonlySet<string> = new Set(['job', 'jobs', 'hiring', 'offre_emploi', 'offre_d_emploi'])

export function isJobOffer(signal: {
  type?: string | null | undefined
  source_kind?: string | null | undefined
  source?: string | null | undefined
}): boolean {
  if (JOB_TYPE_ALIASES.has((signal.type ?? '').trim().toLowerCase())) return true
  if ((signal.source_kind ?? '').trim().toLowerCase() === 'job') return true
  return /offre d.emploi/.test((signal.source ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase())
}

const OFFER_TITLE_NOISE = new Set(['et', 'and', 'ou'])

export const offerTitleKey = (title: string): string =>
  normalizeText(title)
    .filter(token => !OFFER_TITLE_NOISE.has(token))
    .join(' ')

type FoldedOffer<T> = T & { offerCount?: number; offerPlaces?: string[] }

export function foldSameTitleOffers<
  T extends Pick<RecentSignal, 'signal' | 'location'> & Partial<Pick<RecentSignal, 'type' | 'source' | 'source_kind'>>,
>(signals: readonly T[]): FoldedOffer<T>[] {
  const out: FoldedOffer<T>[] = []
  const byTitle = new Map<string, FoldedOffer<T>>()
  for (const signal of signals) {
    const key = isJobOffer(signal) && signal.signal ? offerTitleKey(signal.signal) : ''
    const first = key ? byTitle.get(key) : undefined
    if (!first) {
      const entry: FoldedOffer<T> = { ...signal }
      out.push(entry)
      if (key) byTitle.set(key, entry)
      continue
    }
    first.offerCount = (first.offerCount ?? 1) + 1
    const places = first.offerPlaces ?? (first.location?.trim() ? [first.location.trim()] : [])
    const place = signal.location?.trim()
    if (place && !places.includes(place)) places.push(place)
    first.offerPlaces = places
  }
  return out
}
