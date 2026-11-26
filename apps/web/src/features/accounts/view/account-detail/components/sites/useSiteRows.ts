import { useQuery } from '@tanstack/react-query'
import { useMemo } from 'react'
import { accountsApi } from '@/features/accounts/api'
import { useCommuneCoordinatesReady } from '@/lib/zones/commune-coordinates'
import { mergeRows, normaliseBranches, normaliseClaudeSites, pageOfCities } from './siteGeo'
import { siteCategory, type SiteViewMode } from './siteStyles'
import { BRANCH_PAGE_SIZE, branchesPageKey, type SiteRow } from './siteTypes'

type SiteRowsResult = {
  /** Every site of the loaded page, both sources merged — the ONE list the
   *  header counters, the table and the map all read from. */
  rows: SiteRow[]
  totalPages: number
  isLoading: boolean
  isFetching: boolean
  hasAnySite: boolean
  /** #4326 — TOUS les sites (registre sur toutes les pages + modèle), pour la
   *  carte, les compteurs et la répartition : la page ne sert qu'au tableau. */
  allRows: SiteRow[]
}

/** Garde-fou : au-delà, on s'arrête et la carte le dit (jamais en silence). */
const MAX_BRANCH_PAGES = 40

/** Single source of truth for the sites tab. The header counters and the table
 *  used to each derive their own list — the header counted the model's sites
 *  while the table showed the merge, so they disagreed on screen. */
export function useSiteRows(accountId: string, claudeSites: unknown, page: number): SiteRowsResult {
  const offset = (page - 1) * BRANCH_PAGE_SIZE
  const { data, isLoading, isFetching } = useQuery({
    queryKey: branchesPageKey(accountId, page, BRANCH_PAGE_SIZE),
    queryFn: () => accountsApi.listBranches(accountId, offset, BRANCH_PAGE_SIZE),
    staleTime: 60_000,
    placeholderData: previous => previous,
  })

  // #4326 — la carte et les compteurs lisent TOUS les établissements, pas la
  // seule page du tableau (50 → « 45 sites » pour 525 réels).
  const { data: allBranches } = useQuery({
    queryKey: [...branchesPageKey(accountId, 0, BRANCH_PAGE_SIZE), 'all'],
    queryFn: async () => {
      const first = await accountsApi.listBranches(accountId, 0, BRANCH_PAGE_SIZE)
      const pages = Math.min(MAX_BRANCH_PAGES, Math.max(1, Math.ceil(first.pagination.totalItems / BRANCH_PAGE_SIZE)))
      const rest = await Promise.all(
        Array.from({ length: pages - 1 }, (_, index) =>
          accountsApi.listBranches(accountId, (index + 1) * BRANCH_PAGE_SIZE, BRANCH_PAGE_SIZE),
        ),
      )
      return [first, ...rest].flatMap(page => page.data)
    },
    staleTime: 60_000,
  })

  // #5069 — les coordonnées des communes (carte) viennent du référentiel chargé à la demande : les lignes se
  // recalculent à son arrivée.
  const coordinatesReady = useCommuneCoordinatesReady()
  /* eslint-disable react-hooks/exhaustive-deps -- `coordinatesReady` : lu en coulisse par `coordsFor` */
  const claudeRows = useMemo(() => normaliseClaudeSites(claudeSites), [claudeSites, coordinatesReady])
  const firstPageRows = useMemo(
    () => mergeRows(normaliseBranches(data?.data ?? []), claudeRows),
    [claudeRows, data, coordinatesReady],
  )
  const allRows = useMemo(
    () => mergeRows(normaliseBranches(allBranches ?? data?.data ?? []), claudeRows),
    [allBranches, claudeRows, data, coordinatesReady],
  )
  /* eslint-enable react-hooks/exhaustive-deps */
  const total = data?.pagination.totalItems ?? 0
  // #4326.1 — une fois TOUS les établissements lus, la liste se pagine par VILLE regroupée : paginer les
  // établissements bruts puis regrouper faisait de la page courante « la liste » — Paris, tardive dans l'ordre du
  // registre, n'y figurait jamais alors que la carte (toutes pages) la plaçait.
  const cityPage = useMemo(() => pageOfCities(allRows, page, BRANCH_PAGE_SIZE), [allRows, page])
  const rows = allBranches ? cityPage.rows : firstPageRows

  return {
    rows,
    totalPages: allBranches ? cityPage.totalPages : Math.max(1, Math.ceil(total / BRANCH_PAGE_SIZE)),
    isLoading: isLoading && !data,
    isFetching,
    allRows,
    hasAnySite: total > 0 || claudeRows.length > 0,
  }
}

/** Apply the category tab to an already-merged row list. */
export function filterSiteRows(rows: SiteRow[], category: SiteViewMode): SiteRow[] {
  return category === 'all' ? rows : rows.filter(row => siteCategory(row) === category)
}

/** Category order for the tab bar (mirrors SiteViewTabs' key order, minus `all`). */
const SITE_CATEGORY_ORDER: Exclude<SiteViewMode, 'all'>[] = ['headquarters', 'office', 'establishment', 'industrial']

/**
 * The categories that actually have at least one site in the loaded rows — so the
 * tab bar never offers an empty category (« Sites industriels » → 0). The model's
 * categorised sites merge into every page, so a category backed by them stays
 * stable across pagination; a category with zero sites simply never appears.
 * Returned in the canonical tab order.
 */
export function siteCategoriesPresent(rows: SiteRow[]): Exclude<SiteViewMode, 'all'>[] {
  const present = new Set(rows.map(siteCategory))
  return SITE_CATEGORY_ORDER.filter(category => present.has(category))
}

/** Distinct regions, or ``null`` when no row carries one. A region count that
 *  cannot be established is hidden by the caller, never shown as a "0". */
export function countRegions(rows: SiteRow[]): number | null {
  const regions = new Set(rows.map(row => row.region).filter((region): region is string => Boolean(region)))
  return regions.size > 0 ? regions.size : null
}
