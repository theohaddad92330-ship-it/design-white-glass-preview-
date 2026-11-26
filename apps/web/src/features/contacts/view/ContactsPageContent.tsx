import { type ReactNode, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useActiveContactFilters } from '@/features/contacts/hooks/useActiveContactFilters'
import { useContactsFilters } from '@/features/contacts/hooks/useContactsFilters'
import { useContactsListData } from '@/features/contacts/hooks/useContactsListData'
import { useContactsLoadMoreRef } from '@/features/contacts/hooks/useContactsLoadMoreRef'
import { useContactsNavigation } from '@/features/contacts/hooks/useContactsNavigation'
import { useContactsSearchState } from '@/features/contacts/hooks/useContactsSearchState'
import { useTrackSearchPerformed } from '@/lib/useTrackSearchPerformed'
import { useLauraContext } from '@/features/laura/bubble/page-context-store'
import type { RecommendedFilterValue } from './contacts-list/ContactsRecommendedToggle'
import { contactsLauraContext } from './contacts-laura-context'
import { ContactContent } from './ContactContent'

/** #1688.2 — le MOTIF d'écran, jamais dérivé (même convention que
 *  `PARTNERS_SCREEN` dans `TabPartners.tsx`). */
const CONTACTS_SCREEN = '/contacts'

export function ContactsPageContent({
  from = '/contacts/',
  filtersOpen = false,
  onFiltersOpenChange = () => {},
  onSelectionActiveChange,
  renderIntro,
}: {
  from?: '/contacts/'
  /** #3376 — piloté depuis `ContactsPage`, partagé avec le déclencheur
   *  compact de `ContactsIntro` (voir `ContactContent`). Facultatif : les
   *  tests qui ne portent pas sur les filtres n'ont pas à le fournir. */
  filtersOpen?: boolean
  onFiltersOpenChange?: (open: boolean) => void
  /** #3471 — voir `ContactContent`. */
  onSelectionActiveChange?: (active: boolean) => void
  /** Théo B c1-repertoire — voir `ContactContent`. */
  renderIntro?: (askLaura: ReactNode) => ReactNode
} = {}) {
  const {
    query,
    roleFilter,
    companyFilter,
    tagFilter,
    channelFilter,
    unassignedFilter,
    stateFilter,
    dormantFilter,
    locationFilter,
    assignedToFilter,
    accountIdFilter,
    viewFilter,
    familyFilter,
    entityFilter,
    titleFilter,
    updatedWithinFilter,
    targetListIdFilter,
    sourceFilter,
    hierarchyLevelFilter,
    withoutNextActionFilter,
    lastActivityKindFilter,
    userStatusFilter,
    importJobFilter,
  } = useContactsSearchState(from)
  const filters = useContactsFilters(from)
  /**
   * #3942.2 — recette prod 09/10 (#3942, PARTIEL) : la portée « Recommandés »
   * part désormais dans la requête de liste (serveur, paginé), jamais un
   * filtre appliqué après coup sur la page chargée (`useRecommendedContactIds`,
   * retiré). Un `useState` LOCAL comme avant ce lot (pas l'URL) : aucun lien
   * profond ne désigne « la portée Recommandés de /contacts ».
   */
  const [recommendedFilter, setRecommendedFilter] = useState<RecommendedFilterValue>(
    // #4597.3 — « voir les N contacts de cet import » : la liste montre TOUS les N, pas le sous-ensemble recommandé.
    importJobFilter ? 'all' : 'recommended',
  )
  // #4982.1 — le tri « zone » : un geste local (comme la portée), fait EN SQL côté serveur, jamais sur la page chargée.
  const [zoneSort, setZoneSort] = useState(false)
  const filtersWithRecommendedScope = useMemo(
    () => ({ ...filters, recommendedScope: recommendedFilter, ...(zoneSort ? { sort: 'zone' as const } : {}) }),
    [filters, recommendedFilter, zoneSort],
  )
  const {
    contacts,
    totalContacts,
    lifecycleTally,
    recommendedTally,
    channelTally,
    isLoading,
    isError,
    isFetchingNextPage,
    hasNextPage,
    fetchNextPage,
    loadNextPageRows,
    refetch,
  } = useContactsListData(filtersWithRecommendedScope)
  // #1688.2 — ÉMIS quand la recherche RÉSOUT (`!isLoading`), déduplié par
  // requête : `totalContacts` est le compte TOTAL du serveur (jamais compté
  // sur `contacts.length`, qui n'est qu'une PAGE) — c'est la mesure qui rend
  // « recherche à zéro résultat » exploitable. Rien n'émet tant qu'aucun texte
  // n'est tapé : parcourir la liste sans chercher n'est pas une recherche.
  useTrackSearchPerformed(CONTACTS_SCREEN, query, totalContacts, isLoading)
  const activeFilters = useActiveContactFilters({
    roleFilter,
    companyFilter,
    tagFilter,
    channelFilter,
    unassignedFilter,
    dormantFilter,
    locationFilter,
    assignedToFilter,
    accountIdFilter,
    familyFilter,
    entityFilter,
    titleFilter,
    updatedWithinFilter,
    targetListIdFilter,
    sourceFilter,
    hierarchyLevelFilter,
    withoutNextActionFilter,
    lastActivityKindFilter,
    userStatusFilter,
  })
  const {
    onQueryChange,
    onFiltersChange,
    onAddFilter,
    onScopeChange,
    onLifecycleFilterChange,
    onClearFilters,
    onViewChange,
    onClearImportJob,
  } = useContactsNavigation(from)
  const loadMoreRef = useContactsLoadMoreRef({ hasNextPage, isFetchingNextPage, fetchNextPage })

  const { t } = useTranslation('contacts')
  // #2309.33 — ce que l'écran Contacts déclare à Laura : le total détecté et
  // les prêts à contacter (mêmes chiffres que le bandeau funnel, GA-26), les
  // filtres actifs, et un stock MESURÉ vide nommé comme un manque.
  useLauraContext(
    contactsLauraContext(t, {
      isLoading,
      lifecycleTally,
      activeFilterCount: activeFilters.length + (query.trim() ? 1 : 0),
    }),
  )

  return (
    <ContactContent
      contacts={contacts}
      totalContacts={totalContacts}
      lifecycleTally={lifecycleTally}
      recommendedFilter={recommendedFilter}
      onRecommendedFilterChange={setRecommendedFilter}
      zoneSort={zoneSort}
      onZoneSortChange={setZoneSort}
      recommendedTally={recommendedTally}
      channelTally={channelTally}
      stateFilter={stateFilter}
      onLifecycleFilterChange={onLifecycleFilterChange}
      viewFilter={viewFilter}
      onViewChange={onViewChange}
      loading={isLoading}
      query={query}
      onQueryChange={onQueryChange}
      activeFilters={activeFilters}
      onFiltersChange={onFiltersChange}
      onAddFilter={onAddFilter}
      unassignedFilter={unassignedFilter}
      onScopeChange={onScopeChange}
      onClearFilters={onClearFilters}
      isFilterActive={Boolean(query) || activeFilters.length > 0 || Boolean(stateFilter) || Boolean(importJobFilter)}
      importJobActive={Boolean(importJobFilter)}
      onClearImportJob={onClearImportJob}
      loadingMore={isFetchingNextPage}
      hasNextPage={hasNextPage}
      onLoadMore={() => void fetchNextPage()}
      onLoadNextPageRows={loadNextPageRows}
      error={isError}
      loadMoreRef={loadMoreRef}
      filtersOpen={filtersOpen}
      onFiltersOpenChange={onFiltersOpenChange}
      onSelectionActiveChange={onSelectionActiveChange}
      renderIntro={renderIntro}
      onRetry={() => void refetch()}
    />
  )
}
