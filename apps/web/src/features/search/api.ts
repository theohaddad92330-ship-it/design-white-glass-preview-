import type {
  CompanySearchLens,
  CompanySearchResponse,
  MarketContextSearchRead,
  MarketPathsBatchRead,
  MarketPreviewRead,
  WorkspaceMarket,
} from '@bellum/contracts'
import { apiFetch } from '@/lib/api'
import type { MarketContextQuery } from '@/features/discover/lib/market-context'

/** Stable query keys for company autocomplete reads. Keyed by `country` too so
 *  switching the market flag re-fetches (and caches) per-country suggestions. */
export const companyKeys = {
  all: ['companies'] as const,
  // `lens` is part of the key: the same query returns a DIFFERENT ordering
  // under the ESN lens, so the two must not share a cache entry.
  search: (query: string, limit: number, country: WorkspaceMarket, lens?: CompanySearchLens) =>
    ['companies', 'search', country, query, limit, lens ?? 'generic'] as const,
  /**
   * #1589.2 — la preview mémoire marché d'UNE entreprise, avant tout débit.
   * Le pays fait partie de la clé : c'est le seul départage d'homonymes de ce
   * chemin, donc deux pays sont deux réponses.
   */
  marketPreview: (name: string, country: WorkspaceMarket) => ['companies', 'market-preview', country, name] as const,
  /** #1593.2 — le départage des chips, lu en UN appel pour tout le lot. */
  marketPaths: (names: readonly string[], country: WorkspaceMarket) =>
    ['companies', 'market-paths', country, [...names].sort().join('|')] as const,
  /** #1626 — la recherche par contexte marché observé (Découvrir, onboarding). */
  marketContextSearch: (query: MarketContextQuery) => ['companies', 'market-context-search', query] as const,
}

export const companiesApi = {
  search(
    query: string,
    limit = 5,
    country: WorkspaceMarket = 'FR',
    lens?: CompanySearchLens,
  ): Promise<CompanySearchResponse> {
    const params = new URLSearchParams({ q: query, limit: String(limit) })
    // FR (default) omits `country` so the French request is byte-identical; a
    // non-FR market delegates to the matching country pack server-side.
    if (country && country !== 'FR') params.set('country', country)
    // Same idea for the lens: omitted unless the caller explicitly asks for the
    // ESN ranking, so the prospect-search request is unchanged.
    if (lens === 'esn') params.set('lens', lens)
    return apiFetch<CompanySearchResponse>({ path: `/companies/search?${params.toString()}` })
  },
  /**
   * #1589.2 — ce que Bellum sait déjà d'une entreprise, AVANT de dépenser un
   * crédit. Zéro débit : c'est une lecture du corpus déjà ingéré.
   */
  marketPreview(name: string, country: WorkspaceMarket): Promise<MarketPreviewRead> {
    const params = new URLSearchParams({ name })
    if (country && country !== 'FR') params.set('country', country)
    return apiFetch<MarketPreviewRead>({ path: `/companies/market-preview?${params.toString()}` })
  },
  /**
   * #1593.2 — les parcours observés pour un LOT de noms.
   *
   * ⚠️ `name` se répète plutôt que de se séparer par une virgule : une raison
   * sociale en contient (« ROCHE BOBOIS, SA »), et un séparateur qui coupe au
   * milieu d'un nom interroge une entreprise qui n'existe pas.
   */
  marketPaths(names: readonly string[], country: WorkspaceMarket): Promise<MarketPathsBatchRead> {
    const params = new URLSearchParams()
    for (const name of names) params.append('name', name)
    if (country && country !== 'FR') params.set('country', country)
    return apiFetch<MarketPathsBatchRead>({ path: `/companies/market-paths?${params.toString()}` })
  },
  /**
   * #1626 — la recherche par contexte marché observé. Zéro débit : une
   * lecture sur `MarketMemoryService.searchByFilters`, relayée telle quelle
   * par `GET /companies/market-context-search`.
   */
  marketContextSearch(query: MarketContextQuery): Promise<MarketContextSearchRead> {
    const params = new URLSearchParams()
    if (query.technology) params.set('technology', query.technology)
    if (query.location) params.set('location', query.location)
    if (query.esn) params.set('esn', query.esn)
    if (query.roleFamily) params.set('roleFamily', query.roleFamily)
    if (query.employeeMin !== undefined) params.set('employeeMin', String(query.employeeMin))
    if (query.employeeMax !== undefined) params.set('employeeMax', String(query.employeeMax))
    return apiFetch<MarketContextSearchRead>({ path: `/companies/market-context-search?${params.toString()}` })
  },
}
