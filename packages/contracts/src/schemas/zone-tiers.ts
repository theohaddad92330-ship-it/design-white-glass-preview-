import { z } from 'zod'
import { CRITERIA_WIDEN_MIN_RESULTS } from './criteria-referential.js'

/**
 * #4429.1 — LES paliers de zone (décision Louis 21/10/2026, RÉVISÉE le 25/10/2026). Une seule définition (GA-26), lue par
 * Découvrir, Laura (`run_account_search`) et l'analyse d'un dossier : « Toulouse » veut dire Toulouse
 * d'abord, puis ses alentours quand la ville seule rend trop peu de comptes.
 *
 * ⚠️ RÈGLE FINALE (Louis, 27/10/2026 au soir, c144 — ratifie #4640) : une ville cherche dans 100 km (#4641) ; si ça
 * ne suffit pas, l'élargissement AUTOMATIQUE monte par paliers NOMMÉS — le département, PUIS la région — et s'ARRÊTE
 * là, même à 0 compte : « peu de comptes » est une réponse, le filtre de zone a raison. `france` reste dans
 * `ZONE_TIERS` (ordre de tri, vocabulaire d'étiquettes, payloads déjà rendus) mais SORT de l'échelle automatique ;
 * la recherche France entière reste un geste explicite (aucune ville). Historique, écrit pour être lu : 21/10 (25 km →
 * 50 km → département → région) → 25/10 #4429 (arrêt à la région) → 27/10 matin #4640 (confirmé) → 27/10 c143 (jusqu'à
 * la France) → 27/10 soir c144 (arrêt à la région) : livré DEUX fois, renversé deux fois en trois jours. Le barreau
 * `radius_100` ne sert que la « ville exacte ». Le barreau suivant n'est tenté que quand le courant rend MOINS de
 * `ZONE_WIDEN_MIN_RESULTS` comptes ; les exacts restent en tête, les élargis sont étiquetés. #3876 tient : une ville
 * ne devient JAMAIS silencieusement son département — l'élargissement est déclenché par le manque de résultats, et
 * il s'ÉCRIT.
 *
 * Le service IA ne peut pas importer ce paquet (racine Railway `apps/ia`) : les constantes voyagent en
 * JSON (`zone-tiers.constants.json`), miroir Python `apps/ia/app/services/zone_tiers.py`, et une
 * garde des deux côtés rougit dès qu'ils s'écartent.
 */
export const ZONE_TIERS = ['city', 'radius_50', 'department', 'region', 'france'] as const
export type ZoneTier = (typeof ZONE_TIERS)[number]

/**
 * c144 — le DERNIER barreau que l'élargissement AUTOMATIQUE tente (`france` n'y est pas). Miroir :
 * `ZONE_AUTO_MAX_TIER` (`zone_tiers.py`) et `autoMaxTier` du JSON partagé — la garde de parité rougit si l'un bouge.
 */
export const ZONE_AUTO_MAX_TIER = 'region' satisfies ZoneTier
export const zoneTierSchema = z.enum(ZONE_TIERS)

/** Sous ce nombre de comptes, le palier suivant est tenté. Le seuil est CELUI des critères (GA-26 : un seul endroit). */
export const ZONE_WIDEN_MIN_RESULTS = CRITERIA_WIDEN_MIN_RESULTS

/**
 * Le rayon (km) des paliers « cercle ». Le registre public plafonne à 50 km : le service IA couvre les 100 km par
 * sept cercles de 50 km (`apps/ia/app/services/zone_cover.py`), il n'y a rien à recalculer ici.
 */
const ZONE_TIER_RADIUS_KM = { radius_50: 50 } as const

/**
 * #4641 (Louis 27/10/2026) — le rayon qu'une ville seule porte PAR DÉFAUT, et le plus grand qu'un filtre Découvrir
 * peut demander : au-delà de 50 km, le service IA le sert par la voie du barreau `radius_100`, jamais tel quel.
 * Miroir : `DEFAULT_CITY_RADIUS_KM` (`zone_tiers.py`, `discover-types.ts`).
 */
export const DISCOVER_MAX_CITY_RADIUS_KM = 100

/** Louis 02/11/2026 (#4429) : le rayon de DÉPART d'une ville seule (25 km), d'où part l'échelle 50 km → département → région. */
export const DISCOVER_START_CITY_RADIUS_KM = 25

type ZoneLocale = 'fr' | 'en'

/** Gabarits partagés avec Laura (même phrase des deux côtés, jamais deux rédactions). */
const ZONE_HEADLINES = {
  fr: {
    radius: 'Peu de comptes à {place} : recherche élargie à {km} km',
    department: 'Peu de comptes à {place} : recherche élargie au département ({area})',
    region: 'Peu de comptes à {place} : recherche élargie à la région ({area})',
    france: 'Peu de comptes à {place} : recherche élargie à toute la France',
    // 2710N — le barreau a été PARCOURU et n'a rien ajouté : aucun élargissement n'est promis.
    searched: "Peu de comptes à {place} : cherché jusqu'à {area}, sans compte de plus.",
    searchedNoArea: "Peu de comptes à {place} : cherché jusqu'à la région, sans compte de plus.",
  },
  en: {
    radius: 'Few accounts in {place}: search widened to {km} km',
    department: 'Few accounts in {place}: search widened to the department ({area})',
    region: 'Few accounts in {place}: search widened to the region ({area})',
    france: 'Few accounts in {place}: search widened to all of France',
    searched: 'Few accounts in {place}: searched up to {area}, with no further account.',
    searchedNoArea: 'Few accounts in {place}: searched up to the region, with no further account.',
  },
} as const

/**
 * #4657 (recette prod 27/10/2026) — le palier d'une LIGNE élargie, nommé sur la ligne elle-même. Le bandeau annonçait
 * « 3 ajoutés par l'élargissement » et aucune ligne ne disait lesquels : une aire inconnue rendait une étiquette nulle.
 * Un palier France reste NOMMABLE (recherche explicite, payload déjà rendu) — chaque palier se NOMME, jamais une ligne muette.
 */
const ZONE_ROW_LABELS = {
  fr: { department: 'Élargi au département', region: 'Élargi à la région', france: 'Élargi à toute la France' },
  en: { department: 'Widened to the department', region: 'Widened to the region', france: 'Widened to all of France' },
} as const

export const ZONE_TIERS_CONSTANTS = {
  tiers: [...ZONE_TIERS],
  autoMaxTier: ZONE_AUTO_MAX_TIER,
  minResults: ZONE_WIDEN_MIN_RESULTS,
  radiusKm: ZONE_TIER_RADIUS_KM,
  headlines: ZONE_HEADLINES,
  rowLabels: ZONE_ROW_LABELS,
} as const

/** Les paliers AUTOMATIQUES à tenter APRÈS `tier`, dans l'ordre — jamais au-delà de `ZONE_AUTO_MAX_TIER`. */
export function zoneTiersAfter(tier: ZoneTier): ZoneTier[] {
  return ZONE_TIERS.slice(ZONE_TIERS.indexOf(tier) + 1, ZONE_TIERS.indexOf(ZONE_AUTO_MAX_TIER) + 1)
}

/** Le palier courant rend-il trop peu de comptes ? À partir du seuil : non, rien ne s'élargit. */
export function needsZoneWidening(count: number): boolean {
  return count < ZONE_WIDEN_MIN_RESULTS
}

/** Ce que la recherche a fait de la zone — présent SEULEMENT quand elle a élargi (jamais `city`). */
export const discoverZoneWideningSchema = z.object({
  /** La ville demandée, nom canonique (« Toulouse »). */
  place: z.string().min(1),
  /** Le palier finalement appliqué. */
  tier: zoneTierSchema.exclude(['city']),
  /** Les barreaux franchis, dans l'ordre (« le département → la grande région → toute la France ») : chacun se NOMME. */
  steps: z
    .array(zoneTierSchema.exclude(['city']))
    .min(1)
    .optional(),
  /** L'aire nommée du palier (département, région) quand elle est connue. */
  area: z.string().min(1).optional(),
  /** Comptes trouvés dans la ville seule (en tête de liste). */
  exactCount: z.number().int().nonnegative(),
  /** Comptes ajoutés par l'élargissement (étiquetés). */
  widenedCount: z.number().int().nonnegative(),
  /**
   * 2710N — un fait sur ce qui a été TENTÉ (`tier` dit ce qui a été TROUVÉ) : l'échelle automatique a été parcourue
   * jusqu'à `ZONE_AUTO_MAX_TIER` et le total reste sous `ZONE_WIDEN_MIN_RESULTS`. Absent quand l’échelle n’a pas atteint le plafond ; vrai,
   * le bandeau existe même avec `widenedCount: 0` (« cherché jusqu'à la région, sans compte de plus »).
   */
  autoCapReached: z.boolean().optional(),
})
export type DiscoverZoneWidening = z.infer<typeof discoverZoneWideningSchema>

/** Le palier d'UN compte de la liste. Absent sur un compte exact (chemin byte-identique). */
export const discoverCandidateZoneSchema = z.object({
  tier: zoneTierSchema,
  /** Distance au centre de la ville demandée, quand la source donne la position du site. */
  distanceKm: z.number().nonnegative().optional(),
  /** L'aire nommée du compte (son département, sa région). */
  area: z.string().min(1).optional(),
})
export type DiscoverCandidateZone = z.infer<typeof discoverCandidateZoneSchema>

function fill(template: string, values: Record<string, string>): string {
  return template.replace(/\{(\w+)\}/g, (_, key: string) => values[key] ?? '')
}

/** 2710N — l'échelle est allée jusqu'à son plafond SANS ajouter un compte : le bandeau le dit, sans promettre d'élargissement. */
export function isSearchStopOnly(widening: Pick<DiscoverZoneWidening, 'autoCapReached' | 'widenedCount'>): boolean {
  return widening.autoCapReached === true && widening.widenedCount === 0
}

/** « Peu de comptes à Toulouse : recherche élargie à 50 km » — écrit au-dessus de la liste. */
export function zoneWideningHeadline(widening: DiscoverZoneWidening, locale: ZoneLocale = 'fr'): string {
  const templates = ZONE_HEADLINES[locale]
  const { tier, place, area } = widening
  if (isSearchStopOnly(widening)) {
    return fill(area ? templates.searched : templates.searchedNoArea, { place, area: area ?? '' })
  }
  if (tier === 'radius_50') {
    return fill(templates.radius, { place, km: String(ZONE_TIER_RADIUS_KM[tier]) })
  }
  if (tier === 'france') return fill(templates.france, { place })
  // Une aire inconnue ne se nomme pas : le gabarit sans parenthèse.
  return fill(templates[tier], { place, area: area ?? '' }).replace(' ()', '')
}

/** Le geste qui revient à la ville stricte. */
export function zoneRevertLabel(place: string, locale: ZoneLocale = 'fr'): string {
  return locale === 'en' ? `Back to ${place} only` : `Revenir à ${place} seule`
}

/** Le plafond posé par le geste « revenir au barreau d'avant » : jusqu'où l'élargissement automatique peut aller. */
export const zoneCeilingSchema = z.enum(['radius_50', 'department', 'region'])
export type ZoneCeiling = z.infer<typeof zoneCeilingSchema>

/**
 * Le barreau d'AVANT celui qui est appliqué : `null` pour le premier (100 km), dont l'avant est la ville seule
 * (`zoneStrict`). Un geste, un barreau — jamais « tout retirer » d'un coup. Depuis le département, l'avant est
 * « 100 km » : le rayon par défaut (#4641), que le service IA sert sans aucun palier.
 */
export function zoneCeilingBefore(tier: Exclude<ZoneTier, 'city'>): ZoneCeiling | null {
  const before = ZONE_TIERS[ZONE_TIERS.indexOf(tier) - 1]
  const parsed = zoneCeilingSchema.safeParse(before)
  return parsed.success ? parsed.data : null
}

const ZONE_STEP_LABELS = {
  fr: { department: 'le département', region: 'la grande région', france: 'toute la France' },
  en: { department: 'the department', region: 'the wider region', france: 'all of France' },
} as const

/** Un barreau, nommé (« 100 km », « le département », « la grande région », « toute la France »). */
export function zoneStepLabel(tier: Exclude<ZoneTier, 'city'>, locale: ZoneLocale = 'fr'): string {
  if (tier === 'radius_50') return `${ZONE_TIER_RADIUS_KM[tier]} km`
  return ZONE_STEP_LABELS[locale][tier]
}

/**
 * Le geste qui revient au barreau d'avant : « Revenir à 100 km » depuis le département, « Revenir à 50 km » depuis
 * 100 km ; `null` au premier barreau (50 km), dont l'avant est la ville seule — le geste dit alors « Toulouse seule »
 * (`zoneRevertLabel`). Lot S (01/11) : le libellé nomme le barreau RÉEL, jamais le rayon de départ.
 */
export function zoneStepBackLabel(tier: Exclude<ZoneTier, 'city'>, locale: ZoneLocale = 'fr'): string | null {
  const before = zoneCeilingBefore(tier)
  if (!before) return null
  if (locale === 'en') return `Back to ${zoneStepLabel(before, locale)}`
  return before === 'department' ? 'Revenir au département' : `Revenir à ${zoneStepLabel(before, locale)}`
}

/** L'étiquette d'un compte élargi (« à 38 km de Toulouse », « Haute-Garonne »), ou `null`. */
export function candidateZoneLabel(
  zone: DiscoverCandidateZone,
  place: string,
  locale: ZoneLocale = 'fr',
): string | null {
  const { tier } = zone
  if (tier === 'city') return null
  if (tier === 'radius_50') {
    // #4433.3 — « à N km de X » n'est écrit que sur une distance MESURÉE et DANS le rayon du palier. Sinon
    // (position du site absente, ou site mesuré hors cercle) : le critère d'entrée, jamais une proximité inventée.
    if (zone.distanceKm !== undefined && zone.distanceKm <= ZONE_TIER_RADIUS_KM[tier]) {
      const km = Math.round(zone.distanceKm)
      // #4433.3 (re-recette 26/10) — le palier se NOMME aussi sur la ligne (« élarg* » = 0 occurrence au DOM).
      const reach = ZONE_TIER_RADIUS_KM[tier]
      return locale === 'en'
        ? `Widened to ${reach} km · ${km} km from ${place}`
        : `Élargi à ${reach} km · à ${km} km de ${place}`
    }
    return locale === 'en' ? 'Added by the zone widening' : "Ajouté par l'élargissement de zone"
  }
  // #4657 — le palier se nomme toujours ; le département du compte s'y ajoute quand il est connu (jamais deviné).
  const named = ZONE_ROW_LABELS[locale][tier]
  return zone.area ? `${named} · ${zone.area}` : named
}
