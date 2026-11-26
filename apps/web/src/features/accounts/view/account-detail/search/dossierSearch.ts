import { sectionOfTab, type SectionId, type TabId } from '../components/AccountDetailTabsBar'

/**
 * #2128.31-49 — LA RECHERCHE TRANSVERSALE DU DOSSIER, LE SOCLE.
 *
 * Le commercial cherche « la personne de la data », « la levée de fonds », « le
 * REX datalake » — sans savoir dans laquelle des sept sections elle vit. Onze
 * points du registre #2128 disaient « ABSENT parce que la recherche transversale
 * est absente » : c'est UN socle, pas onze livrables. Il tient ici, une fois.
 *
 * Ce fichier ne lit RIEN : il reçoit des objets déjà normalisés par
 * `useDossierSearchIndex` (qui réutilise les lectures que le dossier fait déjà)
 * et rend des résultats. Aucune donnée n'est inventée : un contexte ou une date
 * absents restent `null`, et l'écran ne les affiche pas.
 */

/** #2128.34-43 — les dix types que le retour nomme, dans son ordre. Ajout en FIN
 *  seulement : la valeur voyage dans l'URL (`?item=<type>:<id>`). */
export const DOSSIER_SEARCH_KINDS = [
  'contact',
  'entity',
  'signal',
  'project',
  'need',
  'mission',
  'action',
  'proof',
  'history',
  'source',
] as const
type DossierSearchKind = (typeof DOSSIER_SEARCH_KINDS)[number]

/** #2128.48 — la sous-partie qui porte chaque type. La SECTION se déduit de la
 *  sous-partie par `sectionOfTab` — jamais recopiée ici (GA-26). */
const KIND_TAB: Record<DossierSearchKind, TabId> = {
  contact: 'contacts',
  // `EntitiesGraphCard` est monté dans la sous-partie Sites (TabSites.tsx).
  entity: 'sites',
  signal: 'veille',
  project: 'projects',
  need: 'veille',
  mission: 'missions',
  action: 'plan',
  proof: 'proofs',
  history: 'history',
  // Les sources de la veille (`WatchSourcesPanel`) vivent sous les signaux.
  source: 'veille',
}

export function tabOfKind(kind: DossierSearchKind): TabId {
  return KIND_TAB[kind]
}

/** Un objet du dossier tel que l'index le connaît : six champs, pas un de plus. */
export interface DossierSearchItem {
  readonly kind: DossierSearchKind
  readonly id: string
  /** #2128.45 — le libellé lisible (nom, titre). */
  readonly label: string
  /** #2128.46 — une ligne de contexte (poste, statut, source) — `null` si absente. */
  readonly context: string | null
  /** #2128.47 — date ISO de l'objet — `null` si l'objet n'en porte pas. */
  readonly date: string | null
}

/** Un résultat : l'objet, sa sous-partie et sa section (#2128.44-48). */
export interface DossierSearchResult extends DossierSearchItem {
  readonly tab: TabId
  readonly section: SectionId
}

const DEFAULT_LIMIT = 20

/** Casse et accents pliés : « Équipe » se trouve en tapant « equipe ». */
function fold(value: string): string {
  return value.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
}

/** 0 = le libellé commence par la requête, 1 = il la contient, 2 = contexte
 *  seulement ; `undefined` = un mot manque. */
function relevance(item: DossierSearchItem, phrase: string, tokens: readonly string[]): number | undefined {
  const label = fold(item.label)
  const haystack = `${label} ${fold(item.context ?? '')}`
  if (!tokens.every(token => haystack.includes(token))) return undefined
  if (label.startsWith(phrase) || label.startsWith(tokens[0] ?? '')) return 0
  if (tokens.every(token => label.includes(token))) return 1
  return 2
}

function dateValue(date: string | null): number {
  if (!date) return Number.NEGATIVE_INFINITY
  const time = Date.parse(date)
  return Number.isNaN(time) ? Number.NEGATIVE_INFINITY : time
}

/** #2128.31 / #2128.61 — la recherche, en mémoire : aucun rechargement, aucun
 *  appel réseau par frappe. */
export function searchDossier(
  items: readonly DossierSearchItem[],
  query: string,
  limit: number = DEFAULT_LIMIT,
): DossierSearchResult[] {
  const phrase = fold(query).trim()
  if (!phrase) return []
  const tokens = phrase.split(/\s+/)
  const scored: { item: DossierSearchItem; score: number }[] = []
  for (const candidate of items) {
    const score = relevance(candidate, phrase, tokens)
    if (score !== undefined) scored.push({ item: candidate, score })
  }
  scored.sort((a, b) => a.score - b.score || dateValue(b.item.date) - dateValue(a.item.date))
  return scored.slice(0, limit).map(({ item: found }) => {
    const tab = tabOfKind(found.kind)
    return { ...found, tab, section: sectionOfTab(tab) }
  })
}

type DossierItemKey = Pick<DossierSearchItem, 'kind' | 'id'>

/** #2128.50 — la valeur du paramètre `item` : `<type>:<identifiant>`. */
export function dossierItemRef({ kind, id }: DossierItemKey): string {
  return `${kind}:${id}`
}

/** Lecture tolérante du paramètre `item` — un type inconnu ou un identifiant
 *  vide rendent `undefined` (le dossier s'ouvre alors normalement). */
export function parseDossierItemRef(value: unknown): DossierItemKey | undefined {
  if (typeof value !== 'string') return undefined
  const separator = value.indexOf(':')
  if (separator <= 0) return undefined
  const kind = value.slice(0, separator)
  const id = value.slice(separator + 1)
  if (!id || !(DOSSIER_SEARCH_KINDS as readonly string[]).includes(kind)) return undefined
  return { kind: kind as DossierSearchKind, id }
}

/** #2128.50 — l'ancre HTML d'un objet, préfixée comme celle de sa sous-partie
 *  (`dossier-<clé>`), avec un identifiant réduit aux caractères sûrs. */
export function dossierItemAnchorId({ kind, id }: DossierItemKey): string {
  return `dossier-${kind}-${id.replace(/[^A-Za-z0-9_-]/g, '_')}`
}
