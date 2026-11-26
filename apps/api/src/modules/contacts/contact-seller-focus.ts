import {
  FOREIGN_COUNTRY_NAMES,
  FRENCH_CITY_DEPARTMENTS,
  FRENCH_REGIONS,
  FRENCH_REGION_DEPARTMENTS,
  FRENCH_REGION_NAMES,
  isOutsideGeoPerimeter,
  normalizeScopeLabel,
} from '@bellum/contracts'
import type { AnalysisProfileData } from '@bellum/contracts'

/**
 * LUDOVIC-C LC.1 — la priorité pays / zone / métier du PROFIL appliquée À LA LECTURE.
 *
 * LUDB.6 (IA) ne classait que les NOUVELLES collectes : la fiche STILL (1467 contacts
 * collectés avant) gardait en prod (19/10) dix « contacts prioritaires » allemands,
 * belges et néo-zélandais. Ce noyau pur réordonne le chemin calculé — il ne retire
 * PERSONNE (c76 : le rôle change l'ORDRE, jamais le CONTENU) :
 *   1. zone : en zone du profil (0) < France ou lieu inconnu (1) < hors France connu (2) ;
 *   2. pack industriel seulement : fonctions du pack (BE, direction technique, méthodes,
 *      qualité, maintenance, production, achats industriels) (0) < autres (1) <
 *      DSI / RH / contrôle de gestion (2).
 * Tri STABLE : à tiers égaux, l'ordre du score d'avant est gardé. Un lieu absent ne
 * prouve rien (jamais rangé « étranger » par défaut).
 */

export type SellerFocus = {
  industrial: boolean
  /** Libellés normalisés de TOUTES les zones du profil (« lyon », « paca »…). */
  zoneTokens: string[]
  /**
   * #4983.1 — le profil dit « France » (sans lieu précis) : aucun jeton de zone à nommer, mais les contacts hors
   * France passent derrière. ORDRE seulement.
   */
  franceOnly: boolean
  /** #4984.1 — l'effectif du compte, ou `null` (inconnu : l'ordre d'avant, jamais « 0 »). */
  employeeCount: number | null
  /** #4556.4 — le libellé de zone tel que le profil le déclare (pour NOMMER la zone à l'écran) ; `null` = aucune zone nommable. */
  zoneLabel: string | null
}

type SellerFocusRow = {
  id: string
  email: string | null
  location: string | null
  title: string | null
  raw_data?: Record<string, unknown> | null
}

const NON_ZONE_WORDS = new Set(['france', 'national', 'international', 'full remote', 'remote', 'europe'])

export function sellerFocusFrom(
  profile: Pick<AnalysisProfileData, 'offerDomain' | 'geoZone'> | null | undefined,
): SellerFocus | null {
  const industrial = profile?.offerDomain === 'industrial_engineering'
  const parts = (profile?.geoZone ?? '').split(/[,&/;]| et /).map(part => normalizeScopeLabel(part))
  const zoneTokens = parts.filter(token => token.length >= 3 && !NON_ZONE_WORDS.has(token))
  const unique = [...new Set(zoneTokens)]
  // #4983.1 — « France » vidait les jetons (NON_ZONE_WORDS) : focus null, donc aucun étranger rétrogradé.
  const franceOnly = parts.includes('france')
  if (!industrial && unique.length === 0 && !franceOnly) return null
  // #4556.4 — « Hors zone » sans nom de zone ne dit pas hors de quoi : le libellé déclaré voyage avec le focus.
  const zoneLabel = unique.length > 0 ? (profile?.geoZone ?? '').trim() || null : null
  return { industrial, zoneTokens: unique, franceOnly, employeeCount: null, zoneLabel }
}

/**
 * #4984.1 — l'effectif d'un compte, lu dans son texte libre (« 500 », « 50 000+ », « 1 000 - 5 000 salariés »).
 * Une fourchette vaut son milieu. Rien de lisible (ou 0) ⇒ `null` : « non mesuré » n'est jamais 0.
 */
export function employeesCount(raw: string | null | undefined): number | null {
  const numbers = (raw ?? '').match(/\d[\d\s\u00a0\u202f.,]*\d|\d/g)?.map(chunk => Number(chunk.replace(/\D/g, '')))
  if (!numbers || numbers.length === 0) return null
  const mean = numbers.reduce((sum, n) => sum + n, 0) / numbers.length
  return mean > 0 ? Math.round(mean) : null
}

/** #4984.1 — le focus complété de la taille du compte ; effectif inconnu ⇒ le focus d'avant, inchangé. */
export function withAccountSize(focus: SellerFocus | null, employees: string | null | undefined): SellerFocus | null {
  const employeeCount = employeesCount(employees)
  if (employeeCount === null) return focus
  return { industrial: false, zoneTokens: [], franceOnly: false, zoneLabel: null, ...focus, employeeCount }
}

// #4984.1 — le niveau d'un titre (normalisé). Le rôle change l'ORDRE, jamais le CONTENU.
type SeniorityLevel = 'comex' | 'direction' | 'management' | 'other'
const COMEX_TITLE =
  /\b(ceo|pdg|president|directeur general|directrice generale|dg|coo|cfo|daf|cmo|managing director|general manager)\b/
const DIRECTION_TITLE = /\b(directeur|directrice|director|vp|vice president|head of|dsi|cio|cto|drh|rssi|ciso)\b/
const MANAGEMENT_TITLE = /\b(responsable|manager|chef|lead|head|coordinat\w*)\b/

function seniorityLevel(title: string | null): SeniorityLevel {
  const normalized = normalizeScopeLabel(title ?? '')
  if (COMEX_TITLE.test(normalized)) return 'comex'
  if (DIRECTION_TITLE.test(normalized)) return 'direction'
  if (MANAGEMENT_TITLE.test(normalized)) return 'management'
  return 'other'
}

// Palier de taille → niveaux, du plus ciblé au moins ciblé. < 1 000 / 1 000-10 000 / > 10 000 salariés.
const LEVELS_BY_SIZE: Record<'small' | 'mid' | 'large', SeniorityLevel[]> = {
  small: ['direction', 'comex', 'management', 'other'],
  mid: ['direction', 'management', 'comex', 'other'],
  large: ['management', 'direction', 'other', 'comex'],
}

function sizeTier(employeeCount: number): 'small' | 'mid' | 'large' {
  if (employeeCount < 1000) return 'small'
  return employeeCount <= 10000 ? 'mid' : 'large'
}

/**
 * #4984.2 — la taille du compte ET le palier qui a décidé du niveau cherché, pour que l'écran les LIRE (GA-26 :
 * 1 000 / 10 000 ne vivent qu'ici). Effectif inconnu ⇒ `null` : jamais un palier deviné ni « 0 ».
 */
export function accountSize(
  employees: string | null | undefined,
): { employees: number; tier: 'small' | 'mid' | 'large' } | null {
  const count = employeesCount(employees)
  return count === null ? null : { employees: count, tier: sizeTier(count) }
}

export function contactSizeTier(title: string | null, employeeCount: number): number {
  return LEVELS_BY_SIZE[sizeTier(employeeCount)].indexOf(seniorityLevel(title))
}

/** TLD génériques : ne disent rien du pays de l'employeur. */
const GENERIC_TLDS = new Set(['com', 'net', 'org', 'eu', 'io', 'ai', 'co', 'me', 'tv', 'info', 'biz', 'app', 'tech'])

function emailCountryTld(email: string | null): string | null {
  const host = (email ?? '').trim().toLowerCase().split('@')[1] ?? ''
  const tld = host.split('.').pop() ?? ''
  if (tld.length !== 2 || GENERIC_TLDS.has(tld)) return null
  return tld
}

const text = (value: unknown): string | null => (typeof value === 'string' ? value : null)

export function contactGeoTier(row: Omit<SellerFocusRow, 'id'>, focus: SellerFocus): 0 | 1 | 2 {
  const tld = emailCountryTld(row.email)
  const foreign =
    (tld !== null && tld !== 'fr') ||
    isOutsideGeoPerimeter(
      {
        country: text(row.raw_data?.['country']),
        city: text(row.raw_data?.['city']),
        location: row.location,
        title: row.title,
      },
      { geo_perimeter: 'france' } as Parameters<typeof isOutsideGeoPerimeter>[1],
    )
  if (foreign) return 2
  const place = normalizeScopeLabel([text(row.raw_data?.['city']), row.location].filter(Boolean).join(' '))
  if (place && focus.zoneTokens.some(token => place.includes(token) || token.includes(place))) return 0
  return 1
}

/**
 * #4432.4 — le statut de zone d'un contact, NOMMÉ à l'écran : `in_zone`, `out_of_zone` (lieu connu, hors zone —
 * étranger compris), `place_absent` (aucun lieu lisible : ni en zone ni hors zone, jamais deviné). `null` = le profil
 * ne déclare AUCUNE zone : rien à comparer, rien n'est nommé.
 */
type ContactZoneStatus = 'in_zone' | 'out_of_zone' | 'place_absent'

export function contactZoneStatus(
  row: Omit<SellerFocusRow, 'id'>,
  focus: SellerFocus | null,
): ContactZoneStatus | null {
  if (!focus || focus.zoneTokens.length === 0) return null
  const tier = contactGeoTier(row, focus)
  if (tier === 0) return 'in_zone'
  if (tier === 2) return 'out_of_zone'
  const hasPlace = [text(row.raw_data?.['city']), text(row.raw_data?.['country']), row.location].some(
    part => (part ?? '').trim().length > 0,
  )
  return hasPlace ? 'out_of_zone' : 'place_absent'
}

// Fonctions du pack industriel (titres normalisés, sans accents). LUDOVIC-E LC.1 : « process » seul n'en est plus une
// (« Head of Service Process Development » passait devant BE / méthodes) — il faut un process INDUSTRIEL.
const INDUSTRIAL_FRONT =
  /\b(bureau d etudes?|be|directeur technique|direction technique|cto industriel|technical director|engineering|ingenierie|methodes?|qualite|quality|maintenance|production|usine|plant|industriel(?:le)?|industrialisation|ingenieur process|process engineers?|process industriel|process manufacturing|travaux|achats? industriels?|acheteur industriel|supply chain)\b/
const OFF_PACK =
  /\b(dsi|cio|systemes? d information|informatique|it|ressources humaines|rh|drh|hr|human resources|talent|recrutement|recruteur|controle de gestion|controleur de gestion|controller|comptab\w*|daf|cfo|compliance|conformite|juridique|juriste|legal|dpo)\b/

export function contactFunctionTier(title: string | null, focus: SellerFocus): 0 | 1 | 2 {
  if (!focus.industrial) return 1
  const normalized = normalizeScopeLabel(title ?? '')
  if (!normalized) return 1
  if (OFF_PACK.test(normalized)) return 2
  if (INDUSTRIAL_FRONT.test(normalized)) return 0
  return 1
}

/**
 * Le rang de périmètre de chaque contact (zone × 3 + fonction : 0 = en zone et fonction du
 * pack). Passé au noyau `rankAccountContacts` comme un rang OPAQUE : le noyau ne lit aucun
 * lieu (GA-06), le périmètre de prospection se décide ici. `null` ⇒ ordre d'avant.
 */
export function sellerFocusTiers(
  rows: readonly SellerFocusRow[],
  focus: SellerFocus | null,
): Map<string, number> | null {
  if (!focus) return null
  return new Map(
    rows.map(row => {
      const base = contactGeoTier(row, focus) * 3 + contactFunctionTier(row.title, focus)
      // #4984.1 — la taille du compte départage À l'INTÉRIEUR d'un même rang de zone/fonction ; inconnue ⇒ rang d'avant.
      return [row.id, focus.employeeCount === null ? base : base * 4 + contactSizeTier(row.title, focus.employeeCount)]
    }),
  )
}

export function orderBySellerFocus<T extends { contact_id: string }>(
  sorted: T[],
  rows: readonly SellerFocusRow[],
  focus: SellerFocus | null,
): T[] {
  const tiers = sellerFocusTiers(rows, focus)
  if (!tiers) return sorted
  return sorted
    .map((item, index) => ({ item, tier: tiers.get(item.contact_id) ?? 4, index }))
    .sort((a, b) => a.tier - b.tier || a.index - b.index)
    .map(entry => entry.item)
}

/**
 * #4982.1 — le tri « zone » EN SQL (la liste est paginée côté serveur : jamais un tri de la seule page chargée).
 *
 * Mêmes paliers que `contactGeoTier`, lus sur les colonnes : 0 = en zone du profil, 1 = lieu connu, 2 = hors France
 * connu, 3 = AUCUN lieu (en dernier, jamais rangé « étranger » par défaut). Sans zone au profil, le palier 0 n'existe
 * pas : les lieux connus passent devant les inconnus. `city` regroupe les lignes d'une même ville (#4982.2).
 */
const PLACE_SQL = `translate(lower(coalesce(contact.raw_data->>'city', '') || ' ' || coalesce(contact.location, '')), 'àâäéèêëîïôöùûüç', 'aaaeeeeiioouuuc')`
const CITY_SQL = `nullif(trim(coalesce(nullif(trim(contact.raw_data->>'city'), ''), split_part(contact.location, ',', 1))), '')`

// #4982 — région d'abord (Louis 31/10) : la région se lit au DÉPARTEMENT du code postal (référentiel des contrats,
// GA-26 : pas de second). #4982.3b — sans code postal, elle se lit aussi dans le LIEU ÉCRIT : le NOM d'une région, puis
// une grande ville NOMMÉE comme ville (égalité exacte, référentiel fermé), sauf si le lieu nomme un autre pays.
// Jamais devinée : sinon NULL. Tout le SQL est GÉNÉRÉ depuis les contrats (`placeZoneOf` en est le miroir TS).
const POSTAL_DEPARTMENT_SQL = `substring(trim(coalesce(contact.raw_data->>'postal_code', '') || ' ' || coalesce(contact.raw_data->>'city', '') || ' ' || coalesce(contact.location, '')) from '(?:^|[^0-9])((?:0[1-9]|[1-8][0-9]|9[0-5])[0-9]{3})(?![0-9])')`
const DEPARTMENT_SQL = `left(${POSTAL_DEPARTMENT_SQL}, 2)`
const sqlList = (values: readonly string[]) => values.map(value => `'${value}'`).join(', ')
/** Le texte normalisé comme `normalisePlaceText` : minuscules, sans accents, tout non-alphanumérique = UNE espace. */
const normalisedSql = (expr: string) =>
  `trim(regexp_replace(translate(lower(${expr}), 'àâäéèêëîïôöùûüçœ', 'aaaeeeeiioouuuco'), '[^a-z0-9]+', ' ', 'g'))`
const WRITTEN_PLACE_SQL = `' ' || ${normalisedSql(`coalesce(contact.raw_data->>'city', '') || ' ' || coalesce(contact.location, '') || ' ' || coalesce(contact.raw_data->>'country', '')`)} || ' '`
const WRITTEN_CITY_SQL = normalisedSql(
  `coalesce(nullif(trim(contact.raw_data->>'city'), ''), split_part(coalesce(contact.location, ''), ',', 1))`,
)
const FOREIGN_COUNTRY_SQL = `(${WRITTEN_PLACE_SQL}) ~ ' (${FOREIGN_COUNTRY_NAMES.join('|')}) '`
const POSTAL_REGION_SQL = `CASE ${FRENCH_REGIONS.map(
  region => `WHEN ${DEPARTMENT_SQL} IN (${sqlList(FRENCH_REGION_DEPARTMENTS[region])}) THEN '${region}'`,
).join(' ')} END`
const NAME_REGION_SQL = `CASE WHEN ${FOREIGN_COUNTRY_SQL} THEN NULL ${FRENCH_REGIONS.map(
  region =>
    `WHEN ${FRENCH_REGION_NAMES[region].map(name => `(${WRITTEN_PLACE_SQL}) LIKE '% ${name} %'`).join(' OR ')} THEN '${region}'`,
).join(' ')} END`
const REGION_OF_CITY_DEPARTMENT = (department: string) =>
  FRENCH_REGIONS.find(region => FRENCH_REGION_DEPARTMENTS[region].includes(department))
const CITY_DEPARTMENT_SQL = `CASE WHEN ${FOREIGN_COUNTRY_SQL} THEN NULL ${Object.entries(FRENCH_CITY_DEPARTMENTS)
  .map(([city, department]) => `WHEN ${WRITTEN_CITY_SQL} = '${city}' THEN '${department}'`)
  .join(' ')} END`
const CITY_REGION_SQL = `CASE WHEN ${FOREIGN_COUNTRY_SQL} THEN NULL ${FRENCH_REGIONS.map(region => {
  const cities = Object.entries(FRENCH_CITY_DEPARTMENTS)
    .filter(([, department]) => REGION_OF_CITY_DEPARTMENT(department) === region)
    .map(([city]) => city)
  return cities.length > 0 ? `WHEN ${WRITTEN_CITY_SQL} IN (${sqlList(cities)}) THEN '${region}'` : ''
}).join(' ')} END`
export const ZONE_REGION_SQL = `COALESCE(${POSTAL_REGION_SQL}, ${NAME_REGION_SQL}, ${CITY_REGION_SQL})`
// Département : celui du code postal ; sinon celui de la ville nommée SI elle est de la région retenue ; sinon NULL
// (région lue au seul nom ⇒ « département non dit », jamais inventé).
export const ZONE_DEPARTMENT_SELECT_SQL = `CASE WHEN ${POSTAL_REGION_SQL} IS NOT NULL THEN ${DEPARTMENT_SQL} WHEN ${NAME_REGION_SQL} IS NULL OR ${NAME_REGION_SQL} = ${CITY_REGION_SQL} THEN ${CITY_DEPARTMENT_SQL} END`

/** Les régions que le profil NOMME (« Hauts-de-France » ⇒ hauts_de_france) ; une ville ou un mot libre n'en pose aucune. */
function sellerRegions(focus: SellerFocus | null): string[] {
  const tokens = new Set(focus?.zoneTokens ?? [])
  return FRENCH_REGIONS.filter(region => tokens.has(region.replace(/_/g, ' ')))
}

export function zoneSort(focus: SellerFocus | null): {
  tier: string
  region: string
  city: string
  params: Record<string, string>
} {
  const params: Record<string, string> = {}
  const inZone = (focus?.zoneTokens ?? []).map((token, index) => {
    params[`zoneToken${index}`] = `%${token}%`
    return `${PLACE_SQL} LIKE :zoneToken${index}`
  })
  // #4982 — région du vendeur = palier 0 (ses contacts, même d'une autre ville de la région).
  sellerRegions(focus).forEach((region, index) => {
    params[`zoneRegion${index}`] = region
    inZone.push(`${ZONE_REGION_SQL} = :zoneRegion${index}`)
  })
  const tier = `CASE
    WHEN trim(${PLACE_SQL}) = '' THEN 3
    ${inZone.length > 0 ? `WHEN ${inZone.join(' OR ')} THEN 0` : ''}
    WHEN lower(coalesce(contact.raw_data->>'country', '')) NOT IN ('', 'france', 'fr') THEN 2
    ELSE 1
  END`
  return { tier, region: ZONE_REGION_SQL, city: `lower(${CITY_SQL})`, params }
}

export const ZONE_CITY_SELECT_SQL = CITY_SQL
