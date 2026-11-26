import type { UnifiedFilters } from './discover-filters'
import { parseDepartments } from './discover-registry-vocab'
import { SIZE_BANDS, type SizeBandCode } from './discover-size-bounds'

/**
 * #4301.3 — le résumé « retient / écarte » du haut de « Tous les filtres » : ce que la recherche
 * GARDE et ce qu'elle RETIRE, lu sur les mêmes filtres que le rail (jamais un second état). Une
 * ligne n'existe que si le critère est posé — on n'affiche pas ce qu'on n'a pas.
 */
type SummaryKey = 'zones' | 'sectors' | 'size' | 'intermediaries' | 'excludedSectors' | 'listed' | 'publicEmployers'

export interface SummaryLine {
  key: SummaryKey
  /** Codes bruts (région, secteur, taille…) : l'écran les nomme dans la langue courante. */
  values: string[]
}

interface FilterSummary {
  kept: SummaryLine[]
  dropped: SummaryLine[]
}

export function summarizeFilters(filters: UnifiedFilters): FilterSummary {
  const kept: SummaryLine[] = []
  const dropped: SummaryLine[] = []

  const zones = [
    ...filters.region.filter(Boolean),
    ...parseDepartments(filters.department),
    ...(filters.city.trim() ? [filters.city.trim()] : []),
  ]
  if (zones.length > 0) kept.push({ key: 'zones', values: zones })
  if (filters.sectors.length > 0) kept.push({ key: 'sectors', values: filters.sectors })

  const sizes: SizeBandCode[] = SIZE_BANDS.filter(band =>
    band.ranges.some(range => filters.headcount.includes(range)),
  ).map(band => band.code)
  if (sizes.length > 0) kept.push({ key: 'size', values: sizes })

  // Les « intermédiaires » : les ESN à qui l'on sous-traite. `esn` les garde seuls, `client` les retire.
  if (filters.entityType === 'esn') kept.push({ key: 'intermediaries', values: ['esn'] })

  if (filters.excludeSectors.length > 0) dropped.push({ key: 'excludedSectors', values: filters.excludeSectors })
  if (filters.excludeListed) dropped.push({ key: 'listed', values: [] })
  if (filters.excludePublicEmployers) dropped.push({ key: 'publicEmployers', values: [] })
  if (filters.entityType === 'client') dropped.push({ key: 'intermediaries', values: ['esn'] })

  return { kept, dropped }
}
