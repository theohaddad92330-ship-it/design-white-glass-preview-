import { ZONE_REGIONS } from '@/lib/zones/zone-referential.data'
import type { UnifiedFilters } from './discover-filters'

/**
 * Lot T point 2c (recette prod 01/11) — un NOM d'entreprise tapé seul (« Decathlon ») GARDE les filtres de la recherche
 * précédente (Java, Hauts-de-France). Choix le moins surprenant : on ne les efface pas en silence (le rail est l'état de
 * l'utilisateur) ; l'écran les NOMME à côté du résultat, avec un geste « tout effacer ». Cette fonction rend leur liste.
 */
export function keptCriteriaLabels(
  filters: Pick<UnifiedFilters, 'keywords' | 'technologiesObserved' | 'region' | 'department' | 'city'>,
): string[] {
  const split = (value: string) =>
    value
      .split(/[,;]/)
      .map(part => part.trim())
      .filter(Boolean)
  const techs = split(filters.technologiesObserved)
  const keywords = split(filters.keywords).filter(
    word => !techs.some(tech => tech.toLocaleLowerCase() === word.toLocaleLowerCase()),
  )
  const regions = filters.region.map(code => ZONE_REGIONS.find(([id]) => id === code)?.[1] ?? code)
  const city = filters.city.trim()
  return [...techs, ...keywords, ...regions, ...split(filters.department), ...(city ? [city] : [])]
}

/** Les mêmes filtres, vidés de ce que `keptCriteriaLabels` nomme — le geste « tout effacer ». */
export function withoutKeptCriteria<T extends UnifiedFilters>(filters: T): T {
  return { ...filters, keywords: '', technologiesObserved: '', region: [], department: '', city: '' }
}
