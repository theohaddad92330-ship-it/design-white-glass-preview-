import type { AnalysisScopeSelection } from './analysis.js'
import type { DiscoverOriginCriteria } from './discover-origin.js'

/**
 * #4432.1 — LES CRITÈRES DE ZONE DEVIENNENT LE PÉRIMÈTRE DU DOSSIER (décision Louis 21/10/2026).
 *
 * « J'ai des consultants à placer en Occitanie » → Découvrir aéronautique, Occitanie → Safran : le
 * dossier porte sur Safran EN OCCITANIE (entités, établissements, contacts, recrutements de la zone),
 * pas sur le siège. Avant ce point, la zone voyageait comme une simple hypothèse du vendeur
 * (`seller_hypotheses.py`) et ne restreignait rien.
 *
 * Le périmètre reprend le champ générique du cadrage (`geo_perimeter` + `geo_areas`, #2163.11/.12) :
 * une ville → `city` ; un ou plusieurs départements, une ou plusieurs régions → `region`, nommés. Les
 * libellés restent ceux que le commercial lit, modifiables au cadrage ; le service IA les résout en
 * codes (`scope_filter.py`). Sans critère de zone : `undefined`, l'analyse reste nationale.
 */
export function geoScopeFromOriginCriteria(
  criteria: DiscoverOriginCriteria | null | undefined,
): Pick<AnalysisScopeSelection, 'geo_perimeter' | 'geo_areas'> | undefined {
  const city = criteria?.zone_city?.trim()
  if (city) return { geo_perimeter: 'city', geo_areas: [city] }
  const areas = [...(criteria?.zone_regions ?? []), ...(criteria?.zone_departments ?? [])]
    .map(area => area.trim())
    .filter(Boolean)
  if (areas.length === 0) return undefined
  return { geo_perimeter: 'region', geo_areas: [...new Set(areas)].slice(0, 20) }
}

/** « Élargir à la France » : la zone s'en va, le reste du cadrage reste — aucune re-saisie. */
export function widenGeoScopeToFrance(selection: AnalysisScopeSelection): AnalysisScopeSelection {
  const { geo_areas: _areas, ...rest } = selection
  return { ...rest, geo_perimeter: 'france' }
}
