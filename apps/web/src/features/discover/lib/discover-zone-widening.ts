import {
  ZONE_TIERS,
  candidateZoneLabel,
  discoverCandidateZoneSchema,
  discoverZoneWideningSchema,
  type DiscoverCandidateZone,
  type DiscoverZoneWidening,
  type ZoneCeiling,
} from '@bellum/contracts'
import type { DiscoverRequest } from '@/features/discover/hooks/useDiscoverSearch'

/**
 * #4429.4 — les paliers de zone dans Découvrir (décision Louis 21/10/2026, échelle révisée le 25/10 :
 * ville → 50 km → département → région, un barreau à la fois ; c144 : l'automatique s'arrête à la région,
 * la France reste une recherche explicite).
 *
 * La définition des paliers vit dans `@bellum/contracts` (`zone-tiers.ts`) : l'écran ne fait que
 * LIRE ce que le moteur a fait — le palier appliqué, écrit au-dessus de la liste, et l'étiquette de
 * chaque compte élargi. Un palier illisible est absent, jamais deviné.
 */

/** Le palier d'un compte, avec la ville demandée (pour « à 38 km de Toulouse »). */
export type DiscoverCandidateZoneWithPlace = DiscoverCandidateZone & { place?: string }

export function normalizeZoneWidening(value: unknown): DiscoverZoneWidening | undefined {
  const parsed = discoverZoneWideningSchema.safeParse(value)
  return parsed.success ? parsed.data : undefined
}

export function normalizeCandidateZone(
  value: unknown,
  place: string | undefined,
): DiscoverCandidateZoneWithPlace | undefined {
  const parsed = discoverCandidateZoneSchema.safeParse(value)
  if (!parsed.success || parsed.data.tier === 'city') return undefined
  return place ? { ...parsed.data, place } : parsed.data
}

/** L'étiquette d'un compte élargi, dans la langue de l'écran ; `null` pour un compte exact. */
export function candidateZoneText(zone: DiscoverCandidateZoneWithPlace | undefined, language: string): string | null {
  if (!zone) return null
  return candidateZoneLabel(zone, zone.place ?? '', language.startsWith('en') ? 'en' : 'fr')
}

/**
 * #5069 — la distance MESURÉE d'un compte élargi à une AIRE (département, région) : « à 40 km de Lille ». Le cercle
 * (50 km) la porte déjà dans son étiquette ; une distance absente ne s'écrit pas (jamais « 0 », jamais devinée).
 */
export function candidateZoneDistanceText(
  zone: DiscoverCandidateZoneWithPlace | undefined,
  language: string,
): string | null {
  if (!zone || zone.tier === 'city' || zone.tier === 'radius_50') return null
  if (zone.distanceKm === undefined || !zone.place) return null
  const km = Math.round(zone.distanceKm)
  return language.startsWith('en') ? `${km} km from ${zone.place}` : `à ${km} km de ${zone.place}`
}

/**
 * #5069 (lot 777) — la ligne de zone d'UNE carte, jugée carte par carte contre le rayon cherché. Une distance mesurée
 * DANS le rayon se dit seule (« à 6 km de Lille ») : la carte n'est pas « élargie ». Au-delà, l'élargissement se nomme
 * avec sa distance ; une distance absente se DIT (« distance inconnue »), elle n'est jamais présentée comme dans le
 * rayon ni écrite « 0 ». Sans rayon cherché : l'étiquette d'avant.
 */
export function candidateZoneLine(
  zone: DiscoverCandidateZoneWithPlace | undefined,
  language: string,
  radiusKm: number | undefined,
): string | null {
  const base = candidateZoneText(zone, language)
  if (!zone || !base) return null
  const distance = candidateZoneDistanceText(zone, language)
  if (!radiusKm || radiusKm <= 0) return distance ? `${base} · ${distance}` : base
  const en = language.startsWith('en')
  if (zone.distanceKm !== undefined && zone.distanceKm <= radiusKm && zone.place) {
    const km = Math.round(zone.distanceKm)
    return en ? `${km} km from ${zone.place}` : `à ${km} km de ${zone.place}`
  }
  if (zone.distanceKm === undefined) return `${base} · ${en ? 'distance unknown' : 'distance inconnue'}`
  return distance ? `${base} · ${distance}` : base
}

/**
 * #5069 — le rayon choisi est TENU à l'écran : un compte élargi dont la distance dépasse le rayon, ou inconnue, passe
 * SOUS le séparateur « Au-delà de N km » (même mécanique que `undatedSeparatorIndex` : ordre stable, rien n'est retiré).
 * `beyondAt` : index du premier compte au-delà, -1 quand il n'y en a pas (ou aucun rayon).
 * #5069 (lot 777) — `rankWithin` (rang croissant, ex. « hors cible : moins de 20 salariés » = rang plus haut) : dans CHAQUE
 * partie, tri STABLE par ce rang (pertinence d'abord), rien n'est retiré.
 */
export function splitByRadius<T extends { zone?: DiscoverCandidateZoneWithPlace }>(
  list: readonly T[],
  radiusKm: number | undefined,
  rankWithin?: (row: T) => number,
): { ordered: T[]; beyondAt: number } {
  if (!radiusKm || radiusKm <= 0) return { ordered: [...list], beyondAt: -1 }
  const beyond = (row: T) =>
    row.zone !== undefined &&
    row.zone.tier !== 'city' &&
    (row.zone.distanceKm === undefined || row.zone.distanceKm > radiusKm)
  const relevantFirst = (part: T[]): T[] =>
    rankWithin
      ? part
          .map(row => ({ row, rank: rankWithin(row) }))
          .sort((a, b) => a.rank - b.rank)
          .map(({ row }) => row)
      : part
  const far = list.filter(beyond)
  if (far.length === 0) return { ordered: relevantFirst([...list]), beyondAt: -1 }
  const near = relevantFirst(list.filter(row => !beyond(row)))
  return { ordered: [...near, ...relevantFirst(far)], beyondAt: near.length }
}

function folded(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase()
}

/**
 * « Revenir à Toulouse seule » : la recherche de CETTE ville part en ville stricte (`zoneStrict`).
 * Une autre ville, ou aucun geste, laisse la requête intacte — les paliers s'appliquent.
 */
export function applyZoneStrict(request: DiscoverRequest | null, strictCity: string | null): DiscoverRequest | null {
  if (!request || request.mode !== 'registry' || !strictCity) return request
  const city = request.query.filters.city
  if (!city || folded(city) !== folded(strictCity)) return request
  return { mode: 'registry', query: { ...request.query, filters: { ...request.query.filters, zoneStrict: true } } }
}

/**
 * « Revenir au barreau d'avant » : la recherche de CETTE ville ne dépasse pas `ceiling` (50 km, le département ou la région).
 * Une autre ville, ou aucun geste, laisse la requête intacte. Le geste ne retire pas la zone : il borne l'échelle.
 */
export function applyZoneCeiling(
  request: DiscoverRequest | null,
  step: { city: string; ceiling: ZoneCeiling; radiusKm?: number } | null,
): DiscoverRequest | null {
  if (!request || request.mode !== 'registry' || !step) return request
  const city = request.query.filters.city
  if (!city || folded(city) !== folded(step.city)) return request
  return {
    mode: 'registry',
    query: {
      ...request.query,
      // #4627.9 — « Revenir à 25 km » REPOSE le rayon nommé par le bouton, il ne retombe pas sur le défaut.
      filters: {
        ...request.query.filters,
        zoneCeiling: step.ceiling,
        ...(step.radiusKm !== undefined ? { radiusKm: step.radiusKm } : {}),
      },
    },
  }
}

/** #4433.3 — le palier que le geste « Élargir la zone » demande : jamais au-delà de la région (c144). */
export type ZoneRaiseTier = 'department' | 'region'

/**
 * #4433.3 (recette prod 01/11) — « Élargir la zone » MONTE d'un palier au lieu de retirer la ville : une ville seule
 * (rayon par défaut, ni département ni région posés) passe au département, puis à la région. Au-delà, `null` : la
 * France n'est jamais un palier du geste de montée (le retrait explicite de la ville reste `widenZoneOneStep`).
 * Une autre ville que celle déjà montée repart du département.
 */
export function nextZoneRaise(
  zone: { city: string; department: string; region: readonly string[]; cityRadiusKm?: string },
  current: { city: string; tier: ZoneRaiseTier } | null,
  defaultRadiusKm = '100',
): ZoneRaiseTier | null {
  const city = zone.city.trim()
  if (!city || zone.department.trim() || zone.region.length > 0) return null
  // Un rayon CHOISI (10, 25, 50 km, ou « partout ») est la maille voulue : le geste d'avant s'applique.
  if (zone.cityRadiusKm !== undefined && zone.cityRadiusKm !== defaultRadiusKm) return null
  if (!current || folded(current.city) !== folded(city)) return 'department'
  return current.tier === 'department' ? 'region' : null
}

/**
 * #4433.3 — « Élargir la zone » : la recherche de CETTE ville monte jusqu'à `tier` (le serveur tente les paliers jusque
 * là, chaque compte ajouté porte son étiquette « Élargi »). Une autre ville, ou aucun geste, laisse la requête intacte.
 */
export function applyZoneRaise(
  request: DiscoverRequest | null,
  step: { city: string; tier: ZoneRaiseTier } | null,
): DiscoverRequest | null {
  if (!request || request.mode !== 'registry' || !step) return request
  const city = request.query.filters.city
  if (!city || folded(city) !== folded(step.city)) return request
  return {
    mode: 'registry',
    query: { ...request.query, filters: { ...request.query.filters, zoneRaise: step.tier } },
  }
}

/**
 * #4627 — le bandeau de zone se recompte sur la liste RENDUE (« 25 ajoutés par l'élargissement » au-dessus de 6
 * lignes, mesuré le 26/10). `exactCount` / `widenedCount` étaient fixés à la collecte ; ils sortent ici des lignes
 * que l'écran montre. Aucune ligne élargie rendue : `undefined` — le bandeau ne promet rien. Le barreau dit est le
 * plus lointain qu'une ligne rendue porte, et son aire ne reste que si c'est la région. `allLabelled` dit si CHAQUE
 * ligne élargie porte une étiquette : sans cela, la phrase ne prétend pas qu'elles le sont (aire inconnue = pas de
 * nom, jamais devinée).
 */
export function zoneWideningOfList(
  zone: DiscoverZoneWidening | undefined,
  listed: readonly { zone?: DiscoverCandidateZoneWithPlace }[],
  language = 'fr',
): { widening: DiscoverZoneWidening; allLabelled: boolean } | undefined {
  if (!zone) return undefined
  const widenedRows = listed.filter(row => row.zone !== undefined && row.zone.tier !== 'city')
  if (widenedRows.length === 0) {
    // 2710N — l'arrêt au plafond est un fait sur ce qui a été TENTÉ : « cherché jusqu'à la région, sans compte de plus »
    // se dit même sans aucune ligne élargie. Sans ce fait : le bandeau ne promet rien.
    return zone.autoCapReached === true
      ? { widening: { ...zone, exactCount: listed.length, widenedCount: 0 }, allLabelled: true }
      : undefined
  }
  const tiers = widenedRows.flatMap(row => (row.zone && row.zone.tier !== 'city' ? [row.zone.tier] : []))
  const reached = tiers.reduce<ZoneTierReached>(
    (far, tier) => (ZONE_TIERS.indexOf(tier) > ZONE_TIERS.indexOf(far) ? tier : far),
    'radius_50',
  )
  const { area, steps, ...rest } = zone
  const kept = (steps ?? []).filter(step => ZONE_TIERS.indexOf(step) <= ZONE_TIERS.indexOf(reached))
  const widening: DiscoverZoneWidening = {
    ...rest,
    tier: reached,
    exactCount: listed.length - widenedRows.length,
    widenedCount: widenedRows.length,
    ...(kept.length > 0 ? { steps: kept } : {}),
    // Lot DÉCOUVRIR-ZONE (27/10) — une aire se nomme pour le département comme pour la région ; la France n'en a pas (et l'automatique n'y monte plus : c144).
    ...((reached === 'region' || reached === 'department') && area ? { area } : {}),
  }
  return { widening, allLabelled: widenedRows.every(row => candidateZoneText(row.zone, language) !== null) }
}

type ZoneTierReached = DiscoverZoneWidening['tier']
