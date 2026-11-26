import { ENTITY_TYPES, type DiscoverEntityType } from '@bellum/contracts'
import { NEED_PERIOD_ALL, needNaturesOf, needsPeriodOf } from './discover-needs-filters'
import { migrateLegacySectors } from './discover-sectors'
import { migrateLegacySize, STARTUP_SEGMENT_HEADCOUNT } from './discover-size-bounds'
import {
  CITY_RADIUS_OPTIONS,
  DEFAULT_CITY_RADIUS_KM,
  COMPANY_AGE_BUCKETS,
  GROUP_ROLE_OPTIONS,
  HEADCOUNT_RANGES_SELECTABLE,
  SIGNAL_SOURCES,
  SITE_BASIS_OPTIONS,
} from './discover-types'
import type {
  CityRadiusOption,
  CompanyAgeBucket,
  GroupRoleOption,
  HeadcountRange,
  SignalSource,
  SiteBasisOption,
} from './discover-types'
import {
  DELIVERY_FIT_FILTERS,
  emptyUnifiedFilters,
  REMOTE_POLICY_FILTERS,
  SENIORITY_FILTERS,
  type DeliveryFitFilter,
  type RemotePolicy,
  type SeniorityFilter,
  type UnifiedFilters,
} from './discover-filters'
import { HEADCOUNT_BOUNDS, RECENCY_WINDOWS, STARTUP_SEGMENT_AGE, STARTUP_SEGMENT_LEGAL_FORM } from './discover-query'
import { regionCodeOfAbbreviation } from './discover-offer-territory'
import { COMPANY_CATEGORIES, REGISTRY_REGIONS } from './discover-registry-vocab'

/**
 * Pré-remplissage du rail depuis l'URL (`/discover?sectors=it,finance&…`).
 *
 * Sert la proposition `find_accounts` du Copilote (restitution V2 §14) : le chat
 * n'exécute AUCUNE recherche, il prépare des critères ; le clic de l'utilisateur
 * ouvre cet écran déjà cadré. Sans ce lecteur, le bouton mènerait à un écran
 * vierge — une action fantôme.
 *
 * Tolérant par conception : une valeur hors vocabulaire est IGNORÉE, jamais
 * appliquée « au mieux ». Un rail pré-rempli doit être exactement ce qu'annonçait
 * la proposition, sinon la liste ne répond plus à la question posée.
 */

/**
 * Découpe une liste d'URL (`a,b`) et ne garde que les valeurs connues.
 *
 * Insensible à la casse dans LES DEUX SENS (#2165.64) — `wanted` ET `allowed`
 * sont comparés en minuscule : un vocabulaire en MAJUSCULES (les catégories
 * INSEE `PME`/`ETI`/`GE`) doit relire ce que `searchFromFilters` a écrit, pas
 * seulement un vocabulaire déjà en minuscules (`SIGNAL_SOURCES`).
 */
function pickKnown<T extends string>(raw: unknown, allowed: readonly T[]): T[] {
  const wanted = new Set(
    String(raw ?? '')
      .split(',')
      .map(value => value.trim().toLowerCase())
      .filter(Boolean),
  )
  return allowed.filter(value => wanted.has(value.toLowerCase()))
}

function pickOne<T extends string>(raw: unknown, allowed: readonly T[]): T | null {
  // #4515.2 — `cityRadiusKm="25"` : le routeur garde les guillemets d'une chaîne qui ressemble à un nombre.
  const value = String(raw ?? '')
    .trim()
    .replace(/^"(.*)"$/, '$1')
    .toLowerCase()
  return allowed.find(candidate => candidate.toLowerCase() === value) ?? null
}

const COMPANY_CATEGORY_CODES = COMPANY_CATEGORIES.map(category => category.code)

/** Bornes des tranches cochables — `null` = pas de borne haute. */
const SELECTABLE_RANGE_BOUNDS: ReadonlyArray<[HeadcountRange, number, number | null]> = [
  ['1-9', 1, 9],
  ['10-49', 10, 49],
  ['50-249', 50, 249],
  ['250-999', 250, 999],
  ['1000+', 1000, null],
]

/**
 * #4307.3 — RÉFUTÉ en prod le 23/10 : `/discover?headcount=5000-plus` perdait sa taille (hors vocabulaire),
 * et la taille du PROFIL (ETI, 250-999) prenait sa place. Une taille DEMANDÉE dans l'URL gagne toujours :
 * un seuil ouvert (`5000-plus`, `5000+`) ou un intervalle hors vocabulaire (`100-499`) devient les tranches
 * qui le RECOUVRENT — on élargit d'un cran, on ne perd jamais la demande. Un mot inconnu reste ignoré.
 */
function headcountFromSearch(raw: unknown): HeadcountRange[] {
  const wanted = new Set<HeadcountRange>()
  for (const token of String(raw ?? '')
    .split(',')
    .map(value => value.trim().toLowerCase())
    .filter(Boolean)) {
    const known = HEADCOUNT_RANGES_SELECTABLE.find(range => range === token)
    if (known) {
      wanted.add(known)
      continue
    }
    const open = /^(\d+)\s*(?:\+|-?\s*plus)$/.exec(token)
    const span = /^(\d+)\s*-\s*(\d+)$/.exec(token)
    const min = open ? Number(open[1]) : span ? Number(span[1]) : null
    const max = span ? Number(span[2]) : null
    if (min === null || (max !== null && max < min)) continue
    for (const [range, low, high] of SELECTABLE_RANGE_BOUNDS) {
      if ((high === null || high >= min) && (max === null || low <= max)) wanted.add(range)
    }
  }
  return HEADCOUNT_RANGES_SELECTABLE.filter(range => wanted.has(range))
}

/**
 * #4632 — l'ancien lien du panneau « Contexte marché observé » (`mc_*`, #1627 / #2074.21), lu pour le RAIL.
 * Seule la chaîne EXACTE `"true"` coche le recours externe : une valeur illisible reste décochée, jamais un
 * booléen deviné depuis une URL qu'un tiers peut construire à la main.
 */
function marketContextRailPatch(search: Record<string, unknown>) {
  return {
    technology: String(search.mc_technology ?? '').trim(),
    roleFamily: String(search.mc_roleFamily ?? '').trim(),
    esn: String(search.mc_esn ?? '').trim(),
    esnOnly: search.mc_esnOnly === 'true',
  }
}

/** #4632 — `mc_location` : une région du référentiel par son nom, sinon une VILLE — jamais une région devinée. */
function mcZoneFromSearch(search: Record<string, unknown>): { city: string; region: string[] } {
  const location = String(search.mc_location ?? '').trim()
  if (!location) return { city: '', region: [] }
  const region = regionsFromSearch(location)
  return region.length > 0 ? { city: '', region } : { city: location, region: [] }
}

/**
 * #4632 — `mc_employeeMin` / `mc_employeeMax` : les tranches cochables qui RECOUPENT la fourchette. Le rail ne
 * sait pas couper une tranche ; la tranche qui contient une borne est gardée entière, jamais une borne inventée.
 */
function mcHeadcount(search: Record<string, unknown>): HeadcountRange[] {
  const bound = (raw: unknown): number | undefined => {
    const text = String(raw ?? '').trim()
    const value = Number(text)
    return text && Number.isFinite(value) && value >= 0 ? Math.trunc(value) : undefined
  }
  const min = bound(search.mc_employeeMin)
  const max = bound(search.mc_employeeMax)
  if (min === undefined && max === undefined) return []
  return HEADCOUNT_RANGES_SELECTABLE.filter(range => {
    const { headcountMin = 0, headcountMax = Number.POSITIVE_INFINITY } = HEADCOUNT_BOUNDS[range]
    return (max === undefined || headcountMin <= max) && (min === undefined || headcountMax >= min)
  })
}

function foldLabel(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

/**
 * #4307.3 — `region=Occitanie` (un LIBELLÉ) restait tel quel dans le rail, que le registre ne sait pas lire
 * (il attend `76`) : la région était ignorée. Le libellé (casse, accents, tirets libres) vaut son code INSEE ;
 * un code connu traverse, un sigle (`IDF`) vaut son code ; le reste est ignoré, jamais rapproché « au mieux ».
 */
function regionsFromSearch(raw: unknown): string[] {
  const codes: string[] = []
  for (const token of String(raw ?? '')
    .split(',')
    .map(value => value.trim())
    .filter(Boolean)) {
    const folded = foldLabel(token)
    const code =
      REGISTRY_REGIONS.find(region => region.code === token || foldLabel(region.label) === folded)?.code ??
      regionCodeOfAbbreviation(token)
    if (code && !codes.includes(code)) codes.push(code)
  }
  return codes
}

/**
 * #3878 — RÉFUTÉ en recette prod le 08/10/2026 : l'URL produite pour le CA
 * portait des guillemets encodés (`revenueMin=%22500000000%22`). Une chaîne
 * purement numérique est aussi un JSON valide ; le sérialiseur de recherche
 * PAR DÉFAUT du routeur (TanStack, `JSON.stringify`) la re-guillemette pour
 * préserver son type STRING au rechargement (sans quoi `JSON.parse` la
 * relirait comme un NOMBRE). Le préfixe `v` rend la valeur invalide comme
 * JSON dès le premier caractère : le routeur la laisse alors TELLE QUELLE
 * dans l'URL, jamais entre guillemets. Changer ce comportement pour TOUT le
 * routeur sortirait du périmètre de ce correctif (il porte sur chaque champ
 * numérique de chaque route) ; cette paire encode/décode reste le SEUL codec
 * du CA, comme le reste de ce fichier (#2165.64).
 */
function encodeAmountForUrl(raw: string): string | undefined {
  const digits = raw.replace(/[^\d]/g, '')
  return digits ? `v${digits}` : undefined
}

/** Relit le CA écrit par `encodeAmountForUrl`, ET les anciennes URL : chiffres
 *  nus déjà déguillemetés par le routeur (chaîne OU nombre, selon que l'URL
 *  d'origine portait, ou non, les guillemets de l'ancien comportement). */
function decodeAmountFromUrl(raw: unknown): string {
  const value = String(raw ?? '')
  return (value.startsWith('v') ? value.slice(1) : value).replace(/[^\d]/g, '')
}

/**
 * Le décodage COMPLET, partagé par les deux portes ci-dessous (`filtersFromSearch`
 * — la porte ÉTROITE du Copilote — et `restoredFiltersFromSearch` — la porte
 * LARGE de #2165.64). Une seule dérivation `URL → champs`, deux définitions de
 * « il y a bien quelque chose à appliquer » (GA-26 : la dérivation vit à UN
 * endroit, le SEUIL, lui, dépend de qui pose la question).
 */
function parsedFiltersFromSearch(search: Record<string, unknown>): {
  filters: UnifiedFilters
  hasNarrow: boolean
  hasAny: boolean
} {
  // ⚠️ Les recherches enregistrées AVANT le 04/09/2026 portent les dix
  // anciennes clés larges (`industry`, `energy`…). `pickKnown` les aurait
  // simplement écartées, et un périmètre enregistré aurait disparu en silence.
  // `migrateLegacySectors` les convertit en leurs secteurs fins ; un code déjà
  // fin traverse intact. On archive, on ne supprime pas.
  // ⚠️ L'URL porte les secteurs en CHAÎNE séparée par des virgules, pas en
  // tableau — `pickKnown` le faisait déjà, et l'oublier vide le périmètre.
  const sectors = migrateLegacySectors(
    String(search.sectors ?? '')
      .split(',')
      .map(value => value.trim())
      .filter(Boolean),
  )
  const signalSources = pickKnown<SignalSource>(search.signals, SIGNAL_SOURCES)
  // Un département français tient en 2-3 caractères (« 69 », « 2A », « 974 ») ;
  // au-delà c'est autre chose, on n'applique pas.
  const rawDepartment = String(search.department ?? '')
    .trim()
    .toUpperCase()
  const department = rawDepartment.length >= 2 && rawDepartment.length <= 3 ? rawDepartment : ''
  // #3908 — plusieurs tranches cumulées, même forme liste que `region`/`sectors`
  // (virgules dans l'URL). `'any'` n'est jamais un élément valide du tableau :
  // il n'a pas sa place dans `HEADCOUNT_RANGES_SELECTABLE`.
  const headcountRaw = search.headcount !== undefined ? headcountFromSearch(search.headcount) : mcHeadcount(search)
  const age = pickOne<CompanyAgeBucket>(search.age, COMPANY_AGE_BUCKETS)
  // #4632 — `mc_technology` pose LE champ « Compétences » (#4316 : mots-clés ET techno observée, un seul champ).
  const nativeSkills = String(search.keywords ?? '').trim() || String(search.technologiesObserved ?? '').trim()
  const legacy = marketContextRailPatch(search)
  const legacySkills = nativeSkills ? '' : legacy.technology
  const keywords = String(search.keywords ?? '').trim() || legacySkills
  const nativeZone = [search.city, search.region, search.department].some(value => String(value ?? '').trim())
  const mcZone = nativeZone ? { city: '', region: [] } : mcZoneFromSearch(search)
  const city = String(search.city ?? '').trim() || mcZone.city
  // #2642.2 — un cercle autour de `city`.
  const cityRadiusKm = pickOne<CityRadiusOption>(search.cityRadiusKm, CITY_RADIUS_OPTIONS)
  // #3983.2 — siège ou implantation (la base d'une zone).
  const siteBasis = pickOne<SiteBasisOption>(search.siteBasis, SITE_BASIS_OPTIONS)

  // #2165.64 — le reste du rail (`FilterRail.tsx`), jusqu'ici jamais lu depuis
  // l'URL : un rechargement les perdait tous en silence.
  const nafCode = String(search.nafCode ?? '').trim()
  // #2642.1 — plusieurs régions cochées ensemble (IDF + Occitanie…), même
  // forme que `sectors` : une liste séparée par des virgules dans l'URL.
  const nativeRegion = regionsFromSearch(search.region)
  const region = nativeRegion.length > 0 ? nativeRegion : mcZone.region
  const revenueMin = decodeAmountFromUrl(search.revenueMin)
  const revenueMax = decodeAmountFromUrl(search.revenueMax)
  const legacyCategory = pickKnown<string>(search.companyCategory, COMPANY_CATEGORY_CODES)
  const legalForm = String(search.legalForm ?? '').trim()
  const freetext = String(search.freetext ?? '').trim()
  // Même vocabulaire PARTAGÉ que `sectors` (`UnifiedFilters.excludeSectors`).
  const excludeSectors = migrateLegacySectors(
    String(search.excludeSectors ?? '')
      .split(',')
      .map(value => value.trim())
      .filter(Boolean),
  )
  // #4632 — les clés `mc_*` du lien de Bienvenue / Profil ESN (#1627, #2074.21) se posent DANS LE RAIL : le
  // panneau qu'elles ouvraient est retiré. Une clé native du rail gagne toujours sur sa jumelle `mc_*`.
  const technologiesObserved = String(search.technologiesObserved ?? '').trim() || legacySkills
  const externalRecourseObserved = String(search.externalRecourseObserved ?? '') === '1' || legacy.esnOnly
  const roleFamilyObserved = String(search.roleFamilyObserved ?? '').trim() || legacy.roleFamily
  const ecosystemObserved = String(search.ecosystemObserved ?? '').trim() || legacy.esn
  // #5203 — période et nature des besoins (liens et recherches enregistrées) ; « Tous » est le défaut.
  const needsPeriod = needsPeriodOf(search.needsPeriod)
  const needsNature = needNaturesOf(search.needsNature)
  const groupRole = pickOne<GroupRoleOption>(search.groupRole, GROUP_ROLE_OPTIONS)
  // #2291.2 — même forme que `externalRecourseObserved` : seul « 1 » pose le critère.
  const contractRecourseObserved = String(search.contractRecourse ?? '') === '1'
  const sinceDaysCandidate = Number(search.sinceDays)
  const sinceDays = RECENCY_WINDOWS.includes(sinceDaysCandidate as (typeof RECENCY_WINDOWS)[number])
    ? sinceDaysCandidate
    : null
  const entityType = pickOne<DiscoverEntityType>(search.entityType, ENTITY_TYPES)
  // #3096 / #3097 — RÉFUTÉ en prod le 27/09 : absents d'ici, une recherche
  // lancée avec « Recrutement » + « Full remote » ne rouvrait plus jamais avec
  // ce choix après un partage ou un rechargement — même forme liste que
  // `signalSources` (comma-separated) juste au-dessus.
  const remotePolicies = pickKnown<RemotePolicy>(search.remotePolicies, REMOTE_POLICY_FILTERS)
  const seniorities = pickKnown<SeniorityFilter>(search.seniorities, SENIORITY_FILTERS)
  // #3226 (#3203.6) — même raison, même forme que remotePolicies/seniorities
  // ci-dessus : sans lui ici, un partage de lien avec ce filtre coché ne le
  // rouvrirait pas.
  const deliveryFitFilter = pickKnown<DeliveryFitFilter>(search.deliveryFitFilter, DELIVERY_FIT_FILTERS)

  // #3941.1 — le préréglage « Startup » (âge + forme + catégorie ENSEMBLE) délimite
  // QUI est cherché comme un secteur, pas un simple affinage (`headcount`/`revenue`
  // seuls, eux, ne comptent pas) : sans cette ligne, une proposition Copilote posée
  // UNIQUEMENT avec `company_profile: startup` retombait sur `null` (aucun critère
  // « narrow »), et le clic depuis Laura ouvrait Découvrir sans rien de préréglé.
  // #4362.1 — une ancienne catégorie (lien partagé, recherche sauvegardée) devient des TRANCHES : un seul filtre de taille.
  const { headcount, companyCategory } = migrateLegacySize({
    headcount: [...headcountRaw],
    companyCategory: legacyCategory,
  })
  const startupSegment =
    age === STARTUP_SEGMENT_AGE &&
    legalForm === STARTUP_SEGMENT_LEGAL_FORM &&
    STARTUP_SEGMENT_HEADCOUNT.every(range => headcount.includes(range))
  const hasNarrow =
    sectors.length > 0 ||
    signalSources.length > 0 ||
    department !== '' ||
    // #3392 (reste, recette prod 30/09) — une région seule (« AURA ») est une
    // contrainte géographique aussi ÉTROITE qu'un département : l'exclure
    // d'ici faisait retomber `filtersFromSearch` (la porte du Copilote) sur
    // `null`, et le clic depuis le chat ouvrait Découvrir SANS elle.
    region.length > 0 ||
    keywords !== '' ||
    city !== '' ||
    startupSegment
  const hasAny =
    hasNarrow ||
    headcount.length > 0 ||
    (age !== null && age !== 'any') ||
    nafCode !== '' ||
    region.length > 0 ||
    revenueMin !== '' ||
    revenueMax !== '' ||
    companyCategory.length > 0 ||
    legalForm !== '' ||
    freetext !== '' ||
    excludeSectors.length > 0 ||
    technologiesObserved !== '' ||
    externalRecourseObserved ||
    roleFamilyObserved !== '' ||
    ecosystemObserved !== '' ||
    needsPeriod !== NEED_PERIOD_ALL ||
    needsNature.length > 0 ||
    contractRecourseObserved ||
    (groupRole !== null && groupRole !== 'any') ||
    (sinceDays !== null && sinceDays !== 90) ||
    (entityType !== null && entityType !== 'all') ||
    (cityRadiusKm !== null && cityRadiusKm !== DEFAULT_CITY_RADIUS_KM) ||
    (siteBasis !== null && siteBasis !== 'presence') ||
    remotePolicies.length > 0 ||
    seniorities.length > 0 ||
    deliveryFitFilter.length > 0

  return {
    hasNarrow,
    hasAny,
    filters: {
      ...emptyUnifiedFilters(),
      sectors,
      signalSources,
      department,
      city,
      keywords,
      nafCode,
      region,
      revenueMin,
      revenueMax,
      companyCategory,
      legalForm,
      freetext,
      excludeSectors,
      technologiesObserved,
      externalRecourseObserved,
      roleFamilyObserved,
      ecosystemObserved,
      needsPeriod,
      needsNature,
      contractRecourseObserved,
      remotePolicies,
      seniorities,
      deliveryFitFilter,
      ...(headcount.length > 0 ? { headcount } : {}),
      ...(age && age !== 'any' ? { age } : {}),
      ...(groupRole && groupRole !== 'any' ? { groupRole } : {}),
      ...(sinceDays !== null ? { sinceDays } : {}),
      ...(entityType && entityType !== 'all' ? { entityType } : {}),
      ...(cityRadiusKm ? { cityRadiusKm } : {}),
      ...(siteBasis && siteBasis !== 'presence' ? { siteBasis } : {}),
    },
  }
}

/**
 * Filtres portés par l'URL, ou `null` quand elle n'en porte aucun (cas normal :
 * l'écran s'ouvre alors dans son état d'accueil, comportement inchangé).
 *
 * Porte ÉTROITE (§ci-dessus) : un effectif seul, par exemple, ne vaut pas une
 * proposition — voir `restoredFiltersFromSearch` pour la porte large de #2165.64.
 */
export function filtersFromSearch(search: Record<string, unknown>): UnifiedFilters | null {
  const { filters, hasNarrow } = parsedFiltersFromSearch(search)
  return hasNarrow ? filters : null
}

/**
 * #2165.64 — LE FILTRE VIT DANS L'URL, PAS DANS LE COMPOSANT.
 *
 * La porte LARGE : contrairement à `filtersFromSearch` (qui sert la proposition
 * du Copilote et ignore à dessein un critère isolé comme un effectif seul),
 * ici TOUT critère réellement posé par un commercial — même un seul — doit
 * survivre à un rechargement. C'est la moitié « lecture » du round-trip avec
 * `searchFromFilters`.
 */
export function restoredFiltersFromSearch(search: Record<string, unknown>): UnifiedFilters | null {
  const { filters, hasAny } = parsedFiltersFromSearch(search)
  return hasAny ? filters : null
}

/**
 * R22-DV6 — la taille du profil RETIRÉE par l'utilisateur voyage avec la recherche (URL + dernière recherche,
 * TTL 24 h) : sans elle, rouvrir la recherche — sans tranche d'effectif dans l'URL — la reposait à chaque fois.
 */
export const PROFILE_SIZE_OFF = 'off'

export function profileSizeDeclinedFromSearch(search: Record<string, unknown>): boolean {
  return String(search.profileSize ?? '') === PROFILE_SIZE_OFF
}

/**
 * #2165.64 — l'inverse de `restoredFiltersFromSearch` : ce qu'une recherche
 * LANCÉE écrit dans l'URL. Chaque clé connue est TOUJOURS présente (valeur ou
 * `undefined`) — jamais seulement omise — pour qu'un `navigate({ search: prev
 * => ({ ...prev, ...searchFromFilters(next) }) })` EFFACE un critère retiré au
 * lieu de laisser une vieille valeur trainer derrière un filtre qui vient de
 * repasser à son défaut.
 */
export function searchFromFilters(filters: UnifiedFilters): Record<string, string | number | undefined> {
  return {
    sectors: filters.sectors.length > 0 ? filters.sectors.join(',') : undefined,
    nafCode: filters.nafCode.trim() || undefined,
    department: filters.department.trim() || undefined,
    region: filters.region.length > 0 ? filters.region.join(',') : undefined,
    revenueMin: encodeAmountForUrl(filters.revenueMin),
    revenueMax: encodeAmountForUrl(filters.revenueMax),
    companyCategory: filters.companyCategory.length > 0 ? filters.companyCategory.join(',') : undefined,
    legalForm: filters.legalForm.trim() || undefined,
    city: filters.city.trim() || undefined,
    // #4515.2 — un NOMBRE, jamais la chaîne '50' : le routeur re-sérialise une chaîne qui se lit comme du JSON
    // (`cityRadiusKm="50"`, mesuré à l'écran le 24/10). `any` n'est pas un nombre et reste brut.
    // Louis 01/11/2026 (#4515) — le rayon par défaut (25 km) est ÉCRIT dès qu'une ville est posée : l'URL dit ce qui part.
    cityRadiusKm:
      filters.cityRadiusKm === 'any'
        ? 'any'
        : filters.cityRadiusKm === DEFAULT_CITY_RADIUS_KM && !filters.city.trim()
          ? undefined
          : Number(filters.cityRadiusKm),
    siteBasis: filters.siteBasis !== 'presence' ? filters.siteBasis : undefined,
    headcount: filters.headcount.length > 0 ? filters.headcount.join(',') : undefined,
    age: filters.age !== 'any' ? filters.age : undefined,
    freetext: filters.freetext.trim() || undefined,
    excludeSectors: filters.excludeSectors.length > 0 ? filters.excludeSectors.join(',') : undefined,
    technologiesObserved: filters.technologiesObserved.trim() || undefined,
    externalRecourseObserved: filters.externalRecourseObserved ? '1' : undefined,
    roleFamilyObserved: filters.roleFamilyObserved.trim() || undefined,
    ecosystemObserved: filters.ecosystemObserved.trim() || undefined,
    needsPeriod: filters.needsPeriod !== NEED_PERIOD_ALL ? filters.needsPeriod : undefined,
    needsNature: filters.needsNature.length > 0 ? filters.needsNature.join(',') : undefined,
    groupRole: filters.groupRole !== 'any' ? filters.groupRole : undefined,
    contractRecourse: filters.contractRecourseObserved ? '1' : undefined,
    signals: filters.signalSources.length > 0 ? filters.signalSources.join(',') : undefined,
    // #3096 / #3097 — même forme liste que `signals` juste au-dessus.
    remotePolicies: filters.remotePolicies.length > 0 ? filters.remotePolicies.join(',') : undefined,
    seniorities: filters.seniorities.length > 0 ? filters.seniorities.join(',') : undefined,
    deliveryFitFilter: filters.deliveryFitFilter.length > 0 ? filters.deliveryFitFilter.join(',') : undefined,
    sinceDays: filters.sinceDays !== 90 ? String(filters.sinceDays) : undefined,
    keywords: filters.keywords.trim() || undefined,
    entityType: filters.entityType !== 'all' ? filters.entityType : undefined,
  }
}
