import { useMemo } from 'react'
import type { ActiveFilter } from '@bellum/ui'
import type { ContactsSearchState } from './useContactsSearchState'

// `stateFilter` is excluded like `query`: the lifecycle state is a pill row of
// its own, not a FilterBar chip (same rationale as `unassigned`, see below).
export function useActiveContactFilters(
  // #2158.6 — `viewFilter` (client-side, hors du FilterBar server-side) exclu
  // au même titre que `stateFilter` (pastille de cycle de vie) juste au-dessus.
  // #2834 (#2106.24) — `sourceTagFilter` est un lien profond depuis le brief,
  // jamais saisi à la main : même exclusion qu'`accountIdFilter`, qui n'est
  // pas non plus lu dans le corps de cette fonction. #4597.3 — `importJobFilter` est de la même famille.
  state: Omit<ContactsSearchState, 'query' | 'stateFilter' | 'viewFilter' | 'sourceTagFilter' | 'importJobFilter'>,
): ActiveFilter[] {
  const {
    roleFilter,
    companyFilter,
    tagFilter,
    channelFilter,
    dormantFilter,
    locationFilter,
    assignedToFilter,
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
  } = state
  return useMemo(() => {
    const filters: ActiveFilter[] = []
    if (roleFilter !== 'all') filters.push({ id: 'role', value: roleFilter })
    if (companyFilter) filters.push({ id: 'company', value: companyFilter })
    // #2159.26 — l'étiquette est une puce de barre : active, elle se voit et se retire.
    if (tagFilter) filters.push({ id: 'tag', value: tagFilter })
    if (channelFilter) filters.push({ id: 'channel', value: channelFilter })
    // Le réseau dormant EST une pastille de barre : sans elle, un seuil actif
    // ne se voit pas et ne se retire pas.
    if (dormantFilter) filters.push({ id: 'dormant', value: dormantFilter })
    // #2158.61 — même geste : sans la puce, un filtre Localisation actif ne se
    // verrait ni ne se retirerait.
    if (locationFilter) filters.push({ id: 'location', value: locationFilter })
    // #2158.65 — le porteur du contact : sans la puce, un filtre Owner actif
    // ne se verrait ni ne se retirerait.
    if (assignedToFilter) filters.push({ id: 'assignedTo', value: assignedToFilter })
    // #2158.60 — la famille métier : même geste que `role`, `'all'` n'est pas une puce.
    if (familyFilter && familyFilter !== 'all') filters.push({ id: 'family', value: familyFilter })
    // #2158.57 — l'entité : sans la puce, un filtre Entité actif ne se
    // verrait ni ne se retirerait (même geste que `location`).
    if (entityFilter) filters.push({ id: 'entity', value: entityFilter })
    // #2158.58 — la fonction : sans la puce, un filtre Fonction actif ne se
    // verrait ni ne se retirerait (même geste que `entity`).
    if (titleFilter) filters.push({ id: 'title', value: titleFilter })
    // #2158.67 — même geste que le réseau dormant : un seuil de fraîcheur actif
    // doit se voir et se retirer.
    if (updatedWithinFilter) filters.push({ id: 'updatedWithin', value: updatedWithinFilter })
    // #2158.68 — la cible : sans la puce, un filtre Cible actif ne se
    // verrait ni ne se retirerait.
    if (targetListIdFilter) filters.push({ id: 'targetListId', value: targetListIdFilter })
    // #2158.66 — la source : même geste que `family`, `'all'` n'est pas une
    // puce. `value` reste le fournisseur BRUT (comme `familyFilter`) : c'est
    // la clé que `SelectChipValue` (FilterBar) résout via `findOption` sur les
    // `options` du filtre pour afficher le libellé ANONYMISÉ
    // (`contactSourceLabel`, doctrine « nos fournisseurs ne se nomment
    // jamais ») — jamais cette valeur brute elle-même.
    if (sourceFilter && sourceFilter !== 'all') filters.push({ id: 'source', value: sourceFilter })
    // #2158.59 — le niveau : même geste que `family`/`source`, `'all'` n'est pas une puce.
    if (hierarchyLevelFilter && hierarchyLevelFilter !== 'all')
      filters.push({ id: 'hierarchyLevel', value: hierarchyLevelFilter })
    // #2158.14 (#2997) — la vue « Sans prochaine action » : sans la puce, un
    // filtre actif ne se verrait ni ne se retirerait (même geste que `dormant`).
    if (withoutNextActionFilter) filters.push({ id: 'withoutNextAction', value: 'true' })
    // #2158.69 (#2997) — la nature de la dernière activité : sans la puce, un
    // filtre actif ne se verrait ni ne se retirerait (même geste que `channel`).
    if (lastActivityKindFilter) filters.push({ id: 'lastActivityKind', value: lastActivityKindFilter })
    // #3718 — le statut déclaré (« Répondu »…) : sans la puce, un filtre actif ne se verrait pas.
    if (userStatusFilter) filters.push({ id: 'userStatus', value: userStatusFilter })
    // #1473 — `unassigned` (« À qualifier ») est un SCOPE (l'onglet « Tous / À
    // qualifier »), pas une puce de la barre de filtres — il ne se rend jamais
    // ici, donc changer un autre filtre ne peut pas faire tomber la portée.
    return filters
  }, [
    assignedToFilter,
    channelFilter,
    companyFilter,
    dormantFilter,
    entityFilter,
    familyFilter,
    hierarchyLevelFilter,
    lastActivityKindFilter,
    userStatusFilter,
    locationFilter,
    roleFilter,
    sourceFilter,
    tagFilter,
    targetListIdFilter,
    titleFilter,
    updatedWithinFilter,
    withoutNextActionFilter,
  ])
}
