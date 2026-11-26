import { parseSignalDate, signalSortMs } from '@bellum/contracts'
import { regionCodesOfPlace } from '@/lib/zones/place-region'
import { i18n } from '@/i18n'
import type { WatchlistItem } from '@/features/watchlist/model/watchlist'
import { buildAccountHistory, groupNeedItems, type AccountHistoryRow } from './account-history'
import { fold, sourceSiteOf } from './signal-library'
import { parseSearch, scoreItem, techTermsIn, type ParsedSearch } from './signal-search'

/** #4756 — les tranches de période NOMMÉES : jamais un sélecteur de dates nu. */
export const HISTORY_PERIODS = ['under6m', '6to12m', '12to24m', 'over24m'] as const
export type HistoryPeriod = (typeof HISTORY_PERIODS)[number]

/** #4756 — trois paliers de volume, pas de saisie libre. */
export const HISTORY_VOLUMES = [1, 3, 5] as const
export type HistoryVolume = (typeof HISTORY_VOLUMES)[number]

/**
 * #4756 — « France » est un palier NOMMABLE, jamais appliqué tout seul (Louis 27/10/2026, renverse c143) :
 * l'automatique plafonne à la région. Choisi à la main, il garde tout besoin dont le lieu se lit dans une région.
 */
export const FRANCE_ZONE = 'france'

const DAY_MS = 24 * 60 * 60 * 1000
const MONTH_MS = 30.4375 * DAY_MS

/** Lot 768 — le rang des comptes : « Pertinence » (par leur meilleur besoin, seulement avec une requête), récents, anciens. */
export type HistorySort = 'relevance' | 'recent' | 'oldest'

export type HistoryFilters = {
  /** Lot 768 — recherche par pertinence (`signal-search.ts`) : titre, compétences, détail, nom du compte. */
  query: string
  /** Lot 768 — `null` = automatique : « Pertinence » quand une requête est saisie, sinon « Récents ». */
  sort: HistorySort | null
  /** Métier / techno, lu sur l'intitulé, les compétences et l'extrait de l'offre. */
  tech: string
  /** Famille de métier posée par la collecte (`offer_attachment.job_family`), ou `''`. */
  family: string
  /** Secteur du compte (`''` = tous). */
  sector: string
  /** Site de la source (hostname de l'URL vérifiable), ou `''`. */
  source: string
  /** Code INSEE de région, ou {@link FRANCE_ZONE} ; `null` = aucune contrainte de zone. */
  zone: string | null
  period: HistoryPeriod | null
  minVolume: HistoryVolume | null
}

export const EMPTY_HISTORY_FILTERS: HistoryFilters = {
  query: '',
  sort: null,
  tech: '',
  family: '',
  sector: '',
  source: '',
  zone: null,
  period: null,
  minVolume: null,
}

type HistoryFilterResult = {
  rows: AccountHistoryRow[]
  /** Les BESOINS passés rendus (somme des lignes, faits exclus). */
  needCount: number
  /** Les faits passés rendus (annonces légales, équipe, descriptions). */
  factCount: number
  /** Besoins sans date lisible, écartés d'une tranche de période : ils n'entrent dans aucune, l'écran le dit. */
  undatedExcluded: number
  /** Lot 768 — la recherche lue (`null` = aucune) : l'écran surligne avec elle. */
  search: ParsedSearch | null
  /** Lot 768 — les besoins (et, à défaut, les faits) qui CORRESPONDENT à la requête, tous comptes affichés. */
  matchNeeds: number
  matchFacts: number
}

export type HistoryFacet = { value: string; count: number }

const dateMsOf = (item: WatchlistItem, nowMs: number): number | null =>
  signalSortMs(parseSignalDate(item.signalDate), nowMs)

/**
 * Les régions d'un besoin : le lieu de la ligne (ou de son intitulé), puis le siège / l'adresse du compte — le premier
 * qui se lit dans une région. Le résolveur est celui de Découvrir + le référentiel des communes (lot 772), un seul
 * endroit (GA-26). Rien de lisible ⇒ aucune région (jamais devinée).
 */
const regionsOf = (item: WatchlistItem): string[] => {
  const own = regionCodesOfPlace(item.location)
  return own.length > 0 ? own : regionCodesOfPlace(item.accountLocation)
}

function periodOf(ms: number, nowMs: number): HistoryPeriod {
  const age = nowMs - ms
  if (age < 6 * MONTH_MS) return 'under6m'
  if (age < 12 * MONTH_MS) return '6to12m'
  if (age < 24 * MONTH_MS) return '12to24m'
  return 'over24m'
}

/** Le texte où chercher : l'intitulé affiché, l'intitulé d'origine, les compétences et l'extrait lus dans l'offre. */
function haystackOf(item: WatchlistItem): string {
  const attachment = item.offerAttachment
  const parts = [
    item.displayLabel,
    item.signalLabel,
    ...(attachment?.status === 'attached' ? attachment.skills : []),
    attachment?.extract,
  ]
  return fold(parts.filter((part): part is string => Boolean(part)).join(' '))
}

/** Une techno se retrouve comme MOT entier : « Java » ne trouve pas « JavaScript ». */
const wordsOf = (text: string): string =>
  ` ${fold(text)
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()} `

/**
 * Lot 769 — les technos qu'un besoin PORTE : les compétences de l'offre, puis les technos que son intitulé nomme.
 * Une écriture déjà lue (« java » / « Java ») ne compte qu'une fois ; un besoin sans techno n'en a aucune.
 */
function techsOf(item: WatchlistItem): string[] {
  const skills = item.offerAttachment?.status === 'attached' ? item.offerAttachment.skills : []
  const seen = new Set<string>()
  return [...skills, ...techTermsIn([item.displayLabel, item.signalLabel].filter(Boolean).join(' '))].filter(tech => {
    const key = fold(tech)
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

function matchesTech(item: WatchlistItem, tech: string): boolean {
  const needle = wordsOf(tech)
  if (needle.trim() === '') return true
  return wordsOf(haystackOf(item)).includes(needle)
}

const familyOf = (item: WatchlistItem): string | null =>
  item.offerAttachment?.status === 'attached' ? item.offerAttachment.job_family : null

/** Un secteur « non renseigné » est un repli d'affichage, jamais une valeur sur laquelle filtrer. */
const sectorOf = (item: WatchlistItem): string | null =>
  item.sector && item.sector !== i18n.t('watchlist:model.sectorFallback') ? item.sector : null

function matchesZone(item: WatchlistItem, zone: string | null): boolean {
  if (zone === null) return true
  const regions = regionsOf(item)
  return zone === FRANCE_ZONE ? regions.length > 0 : regions.includes(zone)
}

/**
 * #4756 — CROISER techno × zone × période × volume + texte, sur les besoins PASSÉS d'un espace.
 *
 * Les axes s'appliquent au BESOIN (un filtre ne remplace jamais l'autre : « Java à Lille » ne rend ni Java à Paris
 * ni Python à Lille) ; le volume s'applique ensuite au COMPTE, sur les besoins qui ont passé les autres axes
 * (« au moins 3 offres Java à Lille »). Une absence ne passe jamais un filtre : un besoin sans lieu n'est dans
 * aucune zone, un besoin sans date n'est dans aucune tranche (il se compte à part dans `undatedExcluded`).
 */
export function applyHistoryFilters(
  items: readonly WatchlistItem[],
  filters: HistoryFilters,
  nowMs: number = Date.now(),
): HistoryFilterResult {
  let undatedExcluded = 0
  // #4815 — le compte de sans-date porte sur les besoins PASSÉS seuls : un signal courant n'est jamais dans l'Historique.
  const past = buildAccountHistory(items, nowMs).flatMap(row => [...row.items, ...row.facts])
  const kept = past.filter(item => {
    if (!matchesTech(item, filters.tech) || !matchesZone(item, filters.zone)) {
      return false
    }
    // Un besoin sans famille, sans secteur ou sans lien de source n'est dans AUCUNE valeur de ces axes.
    if (filters.family !== '' && familyOf(item) !== filters.family) return false
    if (filters.sector !== '' && sectorOf(item) !== filters.sector) return false
    if (filters.source !== '' && sourceSiteOf(item.sourceUrl) !== filters.source) return false
    if (filters.period === null) return true
    const ms = dateMsOf(item, nowMs)
    if (ms === null) {
      undatedExcluded += 1
      return false
    }
    return periodOf(ms, nowMs) === filters.period
  })
  const search = parseSearch(filters.query)
  const minVolume = filters.minVolume ?? 1
  const built = buildAccountHistory(kept, nowMs)
  // Lot 768 — un compte correspond par son meilleur besoin ; dans son dépli, les besoins qui correspondent passent
  // en tête (du plus pertinent au moins pertinent), les autres suivent dans l'ordre de date. Le volume compte alors
  // les besoins qui correspondent (« au moins 3 offres Power BI »).
  const ranked = built.flatMap(row => {
    if (!search) return [{ row, best: 0, needs: row.needCount, facts: row.factCount }]
    const order = (list: WatchlistItem[]) => {
      const scored = list.map((item, index) => ({ item, index, score: scoreItem(search, item, nowMs)?.score ?? null }))
      scored.sort((a, b) => (b.score ?? -1) - (a.score ?? -1) || a.index - b.index)
      return { list: scored.map(entry => entry.item), hits: scored.filter(entry => entry.score !== null) }
    }
    const needs = order(row.items)
    const facts = order(row.facts)
    if (needs.hits.length + facts.hits.length === 0) return []
    const best = Math.max(...[...needs.hits, ...facts.hits].map(entry => entry.score!))
    // Lot 773 — les groupes se refont sur l'ordre de pertinence (celui qui correspond en tête) ; une correspondance
    // se compte en LIGNES regroupées : un groupe dont une formulation correspond = 1.
    const hitIds = new Set(needs.hits.map(entry => entry.item.id))
    const groups = groupNeedItems(needs.list)
    return [
      {
        row: { ...row, items: needs.list, groups, facts: facts.list },
        best,
        needs: groups.filter(group => group.members.some(member => hitIds.has(member.id))).length,
        facts: facts.hits.length,
      },
    ]
  })
  const shown = ranked.filter(entry => filters.minVolume === null || entry.needs >= minVolume)
  const sort: HistorySort =
    filters.sort === 'relevance' && !search ? 'recent' : (filters.sort ?? (search ? 'relevance' : 'recent'))
  const lastMs = (entry: (typeof shown)[number]) => entry.row.lastNeedMs
  if (sort === 'relevance') shown.sort((a, b) => b.best - a.best)
  else if (sort === 'oldest')
    shown.sort((a, b) => {
      const left = lastMs(a)
      const right = lastMs(b)
      if (left === right) return 0
      if (left === null) return 1
      if (right === null) return -1
      return left - right
    })
  // #5191 — l'ordre par défaut met les comptes à offres en tête ; un « Plus récents » CHOISI redonne la main à la date.
  else if (filters.sort === 'recent')
    shown.sort((a, b) => {
      const left = lastMs(a)
      const right = lastMs(b)
      if (left === right) return 0
      if (left === null) return 1
      if (right === null) return -1
      return right - left
    })
  const rows = shown.map(entry => entry.row)
  return {
    rows,
    needCount: rows.reduce((sum, row) => sum + row.needCount, 0),
    factCount: rows.reduce((sum, row) => sum + row.factCount, 0),
    // Les sans-date d'un compte écarté par le volume ne se comptent pas : ils ne sont plus à l'écran.
    undatedExcluded: filters.period === null ? 0 : undatedExcluded,
    search,
    matchNeeds: shown.reduce((sum, entry) => sum + entry.needs, 0),
    matchFacts: shown.reduce((sum, entry) => sum + entry.facts, 0),
  }
}

const byCountThenValue = (a: HistoryFacet, b: HistoryFacet): number =>
  b.count - a.count || a.value.localeCompare(b.value)

const tally = (values: Iterable<string>): HistoryFacet[] => {
  const counts = new Map<string, number>()
  for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1)
  return [...counts.entries()].map(([value, count]) => ({ value, count })).sort(byCountThenValue)
}

/**
 * #4756 — les choix proposés : seulement ce que les besoins passés portent (compétences lues, régions lues dans le
 * lieu, familles du vocabulaire connu, secteurs, sites de source). Aucune valeur « pour faire complet » : une facette
 * vide ne s'affiche pas, et un code de famille hors vocabulaire ne s'affiche jamais brut.
 */
export function historyFacets(items: readonly WatchlistItem[]): {
  techs: HistoryFacet[]
  families: HistoryFacet[]
  sectors: HistoryFacet[]
  sources: HistoryFacet[]
  zones: HistoryFacet[]
} {
  const past = buildAccountHistory(items).flatMap(row => row.items)
  const techs = past.flatMap(techsOf)
  const present = <T>(values: (T | null)[]): T[] => values.filter((value): value is T => value !== null)
  return {
    techs: tally(techs),
    families: tally(present(past.map(familyOf)).filter(family => i18n.exists(`discover:rail.jobFamily.${family}`))),
    sectors: tally(present(past.map(sectorOf))),
    sources: tally(present(past.map(item => sourceSiteOf(item.sourceUrl)))),
    zones: tally(past.flatMap(item => regionsOf(item))),
  }
}
