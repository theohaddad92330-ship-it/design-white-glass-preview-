import type { AccountMarketPath } from '@bellum/contracts'

export type MarketPathsFilter = { techno: string; family: string; esn: string }
export const NO_MARKET_PATHS_FILTER: MarketPathsFilter = { techno: '', family: '', esn: '' }

const distinct = (values: ReadonlyArray<string | null>) =>
  [...new Set(values.filter((v): v is string => Boolean(v)))].sort((a, b) => a.localeCompare(b))

/** Les valeurs proposées aux filtres : seulement celles qui existent dans les parcours (absence ⇒ aucune option). */
export function marketPathsFacets(paths: readonly AccountMarketPath[]) {
  return {
    technos: distinct(paths.flatMap(p => p.skills)),
    families: distinct(paths.map(p => p.role_family)),
    esns: distinct(paths.map(p => p.esn_name)),
  }
}

export function filterMarketPaths(paths: readonly AccountMarketPath[], filter: MarketPathsFilter) {
  return paths.filter(
    p =>
      (!filter.techno || p.skills.includes(filter.techno)) &&
      (!filter.family || p.role_family === filter.family) &&
      (!filter.esn || p.esn_name === filter.esn),
  )
}
