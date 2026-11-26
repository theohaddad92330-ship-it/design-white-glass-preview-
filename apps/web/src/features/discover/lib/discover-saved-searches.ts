import type {
  CreateSavedViewInput,
  SavedView,
  SavedViewAlertChannel,
  SavedViewAlertFrequency,
  SavedViewResultType,
} from '@bellum/contracts'
import { discoverStorageKey, readJson, writeJson } from './discover-storage'
import { emptyUnifiedFilters, type UnifiedFilters } from './discover-filters'
import { migrateLegacySize } from './discover-size-bounds'
import type { RegistryFilters, SignalsFilters } from './discover-query'

/* ------------------------------------------------------------------ */
/*  Recherches enregistrées — colonne de gauche.                        */
/*                                                                     */
/*  Un commercial rejoue les mêmes périmètres toutes les semaines       */
/*  (« ETI industrielles 69/38 », « AO IT ouverts Île-de-France »).      */
/*  Les re-saisir à chaque fois est le vrai coût de l'écran v1. Le rail  */
/*  unifié n'y change rien : une recherche enregistrée est simplement    */
/*  un jeu de filtres UNIFIÉS rejouable.                                 */
/*                                                                     */
/*  #2151.3 à .13 — CE QUI A CHANGÉ LE 15/09/2026.                      */
/*                                                                     */
/*  Ces périmètres vivaient dans le `localStorage` du navigateur. Ils ne */
/*  survivaient donc ni au changement de poste, ni au vidage du cache,  */
/*  ni au partage — alors que `saved_views` existait côté serveur depuis */
/*  le CRM natif, avec son `owner_id`, son `shared`, sa borne et ses     */
/*  trois routes, et n'avait qu'UN seul appelant web. Le serveur est     */
/*  désormais le magasin ; ce fichier tient la FORME (ce qu'une          */
/*  recherche porte) et l'ARCHIVE locale.                                */
/*                                                                     */
/*  ⚠️ On ARCHIVE, on ne supprime pas : les recherches déjà écrites dans  */
/*  le navigateur d'un utilisateur sont importées une fois vers le       */
/*  serveur, puis MARQUÉES importées — la clé d'origine n'est jamais     */
/*  effacée. Un import qui tourne mal ne coûte donc rien à personne, et  */
/*  la purge RGPD (`clearDiscoverStorage`) balaie les deux clés.         */
/* ------------------------------------------------------------------ */

const NAMESPACE = 'searches'
/** Les identifiants LOCAUX déjà remontés au serveur — la marque d'archivage. */
const IMPORTED_NAMESPACE = 'searches-imported'

export interface SavedSearch {
  id: string
  label: string
  filters: UnifiedFilters
  savedAt: number
  /** #2151.3 — POURQUOI ce périmètre existe. `null` quand personne ne l'a dit. */
  objective: string | null
  /** #2151.6 — à quelle cadence il se rejoue. */
  alertFrequency: SavedViewAlertFrequency
  /** #2151.12 — par où l'alerte arrive. `null` = aucune alerte. */
  alertChannel: SavedViewAlertChannel | null
  /** #2151.5 — ce que le périmètre RAMÈNE. `null` = non qualifié. */
  resultType: SavedViewResultType | null
  /**
   * #2151.8 — combien de nouveaux éléments depuis la dernière exécution.
   * `null` = jamais rejouée, donc « on n'a pas regardé » — JAMAIS `0`, qui
   * dirait « on a regardé, il n'y a rien ».
   */
  newItems: number | null
  /**
   * #2151.9 — la NATURE des sources qui l'alimentent, jamais l'éditeur. Vide se
   * lit « source non qualifiée », jamais « aucune source ».
   */
  sourceKinds: readonly string[]
  /** #2151.7 — dernière EXÉCUTION. `null` = jamais rejouée, JAMAIS `savedAt`. */
  lastRunAt: string | null
  /** #2151.10 — qui l'a enregistrée. */
  ownerId: string | null
  ownerName: string | null
  /** #2151.11 — partagée avec l'espace, ou personnelle. */
  shared: boolean
}

/**
 * Ce que l'écran COMPOSE, sans les critères : ceux-ci viennent du rail, pas de
 * la colonne de gauche. Tout est optionnel sauf le libellé — enregistrer un
 * périmètre sans écrire d'objectif doit rester un geste d'un seul champ.
 */
export interface SavedSearchDraft {
  label: string
  objective?: string | null
  alertFrequency?: SavedViewAlertFrequency
  alertChannel?: SavedViewAlertChannel | null
  /** #2151.5 — absent = non qualifié, ce qui n'est pas « des comptes ». */
  resultType?: SavedViewResultType | null
  shared?: boolean
}

export type SavedSearchInput = SavedSearchDraft & { filters: UnifiedFilters }

/** Ancienne forme (avant le rail unifié) : `{ mode, registry?, signals? }`. */
interface LegacySavedSearch {
  id?: unknown
  label?: unknown
  savedAt?: unknown
  mode?: unknown
  registry?: Partial<RegistryFilters> & { sector?: string }
  signals?: Partial<SignalsFilters>
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

/**
 * Migre une entrée de l'ancienne forme vers `UnifiedFilters`.
 *
 * Migration DOUCE (§18-19) : les recherches enregistrées avant l'unification
 * doivent continuer de marcher. On reconstruit les filtres unifiés à partir des
 * anciens sous-objets `registry`/`signals` plutôt que de jeter l'entrée.
 */
function migrateLegacy(entry: LegacySavedSearch): UnifiedFilters {
  const unified = emptyUnifiedFilters()
  const registry = entry.registry
  if (isRecord(registry)) {
    const sector = typeof registry.sector === 'string' ? registry.sector : undefined
    if (sector && sector !== 'all') unified.sectors = [sector as UnifiedFilters['sectors'][number]]
    if (typeof registry.nafCode === 'string') unified.nafCode = registry.nafCode
    if (typeof registry.department === 'string') unified.department = registry.department
    if (typeof registry.city === 'string') unified.city = registry.city
    // #3908 — `headcount` est devenu une LISTE (cumul de tranches) ; une
    // recherche enregistrée avant ce lot le porte encore en chaîne unique.
    if (typeof registry.headcount === 'string' && registry.headcount !== 'any') {
      unified.headcount = [registry.headcount as UnifiedFilters['headcount'][number]]
    }
    if (typeof registry.age === 'string') unified.age = registry.age as UnifiedFilters['age']
    if (typeof registry.freetext === 'string') unified.freetext = registry.freetext
  }
  const signals = entry.signals
  if (isRecord(signals)) {
    if (Array.isArray(signals.sources)) unified.signalSources = signals.sources as UnifiedFilters['signalSources']
    if (!unified.department && typeof signals.department === 'string') unified.department = signals.department
    if (typeof signals.sinceDays === 'number') unified.sinceDays = signals.sinceDays
    if (typeof signals.keywords === 'string') unified.keywords = signals.keywords
  }
  return unified
}

/**
 * Des critères venus du serveur (un `jsonb` libre au contrat) vers le rail.
 *
 * On PART du rail vide et on recouvre : une clé que cette version ne connaît
 * plus est ignorée, une clé qu'elle connaît et que la vue n'a pas garde son
 * défaut. Un `as UnifiedFilters` nu rendrait un objet troué, et chaque écran
 * aurait à s'en défendre.
 */
function toUnifiedFilters(value: unknown): UnifiedFilters {
  if (!isRecord(value)) return emptyUnifiedFilters()
  const merged = { ...emptyUnifiedFilters(), ...(value as Partial<UnifiedFilters>) }
  // #3908 — `headcount` est passé de tranche UNIQUE à une LISTE cumulée ; un
  // périmètre serveur écrit avant ce lot porte encore l'ancienne chaîne, que
  // le spread ci-dessus recopierait telle quelle (type qui ne correspond plus
  // à `UnifiedFilters['headcount']`). On archive, on ne jette pas : la valeur
  // d'origine est relue, jamais la forme déjà fusionnée (qui ne la porte plus).
  const rawHeadcount = (value as Record<string, unknown>).headcount
  if (typeof rawHeadcount === 'string') {
    merged.headcount = rawHeadcount !== 'any' ? [rawHeadcount as UnifiedFilters['headcount'][number]] : []
  }
  // #4362.1 — une recherche écrite avec l'ancienne « catégorie officielle » garde son intention : elle devient des
  // tranches du filtre de taille UNIQUE (jamais un second filtre qui se contredit).
  return migrateLegacySize(merged)
}

/** Une entrée locale valide, migrée si besoin — ou `null` si irrécupérable. */
function normalizeEntry(value: unknown): SavedSearch | null {
  if (!isRecord(value)) return null
  const { id, label, savedAt } = value
  if (typeof id !== 'string' || typeof label !== 'string' || label === '') return null
  const at = typeof savedAt === 'number' ? savedAt : Date.now()
  const base = {
    id,
    label,
    savedAt: at,
    objective: null,
    alertFrequency: 'manual' as const,
    alertChannel: null,
    // Une entrée du navigateur n'a jamais été « exécutée » côté serveur —
    // donc ni type de résultat qualifié, ni nouveaux éléments MESURÉS
    // (`null`, jamais 0), ni source qualifiée.
    resultType: null,
    newItems: null,
    sourceKinds: [],
    // Une entrée du navigateur n'a jamais été « exécutée » côté serveur.
    lastRunAt: null,
    ownerId: null,
    ownerName: null,
    shared: false,
  }
  if (isRecord(value.filters)) return { ...base, filters: toUnifiedFilters(value.filters) }
  // Ancienne forme : `mode` + `registry`/`signals` → migration.
  if ('mode' in value || 'registry' in value || 'signals' in value) {
    return { ...base, filters: migrateLegacy(value as LegacySavedSearch) }
  }
  return null
}

function isArrayOfUnknown(value: unknown): value is unknown[] {
  return Array.isArray(value)
}

function isArrayOfString(value: unknown): value is string[] {
  return Array.isArray(value) && value.every(entry => typeof entry === 'string')
}

/** Les recherches ARCHIVÉES dans ce navigateur, la plus récente en tête. */
export function readSavedSearches(userId: string | undefined): SavedSearch[] {
  if (!userId) return []
  const raw = readJson(discoverStorageKey(NAMESPACE, userId), isArrayOfUnknown)
  return (raw ?? []).map(normalizeEntry).filter((entry): entry is SavedSearch => entry !== null)
}

/**
 * Ce qu'il reste à remonter au serveur : les recherches locales qui n'ont pas
 * encore été importées ET dont le libellé n'existe pas déjà là-haut.
 *
 * Le libellé est la clé fonctionnelle depuis toujours ici — ré-enregistrer
 * « Banques Paris » METTAIT À JOUR l'entrée. Remonter un doublon de libellé
 * ferait deux lignes que personne ne saurait distinguer.
 */
export function localSearchesToImport(userId: string | undefined, serverLabels: readonly string[]): SavedSearch[] {
  if (!userId) return []
  const taken = new Set(serverLabels.map(label => label.trim().toLowerCase()))
  const imported = new Set(readJson(discoverStorageKey(IMPORTED_NAMESPACE, userId), isArrayOfString) ?? [])
  return readSavedSearches(userId).filter(
    search => !imported.has(search.id) && !taken.has(search.label.trim().toLowerCase()),
  )
}

/**
 * Marque des recherches locales comme remontées. **La clé d'origine n'est pas
 * touchée** : on archive, on ne supprime pas — si l'import a mal tourné, la
 * donnée de l'utilisateur est encore là, et la purge RGPD balaie les deux clés.
 */
export function markLocalSearchesImported(userId: string | undefined, ids: readonly string[]): void {
  if (!userId || ids.length === 0) return
  const key = discoverStorageKey(IMPORTED_NAMESPACE, userId)
  const already = readJson(key, isArrayOfString) ?? []
  writeJson(key, [...new Set([...already, ...ids])])
}

/** Une vue enregistrée du serveur, lue comme une recherche de Découvrir. */
export function savedViewToSearch(view: SavedView): SavedSearch {
  return {
    id: view.id,
    label: view.name,
    filters: toUnifiedFilters(view.filters),
    savedAt: Date.parse(view.createdAt) || 0,
    objective: view.objective,
    alertFrequency: view.alertFrequency,
    alertChannel: view.alertChannel,
    resultType: view.resultType,
    newItems: view.newItems,
    sourceKinds: view.sourceKinds,
    lastRunAt: view.lastRunAt,
    ownerId: view.ownerId,
    ownerName: view.ownerName,
    shared: view.shared,
  }
}

/**
 * Une recherche composée à l'écran, prête pour `POST /governance/views`.
 *
 * Les critères partent tels quels : le serveur refuse une vue SANS critère
 * (« elle existe déjà : c'est la liste complète »), et c'est bien ce qu'on veut
 * — mais il compte les clés, or `emptyUnifiedFilters()` en porte toujours. On
 * ne retire donc que les valeurs NEUTRES, pour que le refus du serveur tombe
 * quand il doit tomber plutôt que jamais.
 */
export function savedSearchToCreateInput(input: SavedSearchInput): CreateSavedViewInput {
  return {
    scope: 'discover',
    name: input.label.trim(),
    filters: meaningfulFilters(input.filters),
    objective: input.objective?.trim() || null,
    shared: input.shared ?? false,
    alertFrequency: input.alertFrequency ?? 'manual',
    alertChannel: input.alertChannel ?? null,
    // #2151.5 — le type de résultat. `null` par défaut : tant que l'écran ne le
    // demande pas, personne ne l'a qualifié — et lui attribuer « des comptes »
    // parce que c'est ce que Découvrir rend aujourd'hui serait indiscernable
    // d'un vrai choix, y compris le jour où l'écran en rendra d'autres.
    resultType: input.resultType ?? null,
  }
}

/**
 * Les axes réellement POSÉS : ceux qui diffèrent du rail vide.
 *
 * ⚠️ Comparer à une liste de valeurs « neutres » écrite à la main (`''`,
 * `'all'`, `[]`) rate les défauts qui ne ressemblent pas à du vide —
 * `headcount: 'any'` et `sinceDays: 90` en sont, et les enregistrer ferait
 * qu'une recherche SANS critère en porterait deux. Le rail vide est le seul
 * juge : il vit à un endroit, et il suit les défauts quand ils bougent.
 */
export function meaningfulFilters(filters: UnifiedFilters): Record<string, unknown> {
  const neutral = emptyUnifiedFilters() as unknown as Record<string, unknown>
  const kept: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(filters)) {
    if (value === null || value === undefined || value === '') continue
    if (Array.isArray(value) && value.length === 0) continue
    if (JSON.stringify(value) === JSON.stringify(neutral[key])) continue
    kept[key] = value
  }
  return kept
}
