import { useMemo } from 'react'
import type { ContactListQuery } from '@bellum/contracts'
import { useDebounce } from '@/hooks/useDebounce'
import { useContactsSearchState } from './useContactsSearchState'

/** Build the `ContactListQuery` sent to the API from the current URL search
 *  state. Lives at this level so the parent (header badge total) and the
 *  list both subscribe to the same React Query cache entry — no duplicate
 *  fetch. */
export function useContactsFilters(from: '/contacts/' = '/contacts/'): ContactListQuery {
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
    familyFilter,
    entityFilter,
    titleFilter,
    updatedWithinFilter,
    targetListIdFilter,
    sourceTagFilter,
    importJobFilter,
    sourceFilter,
    hierarchyLevelFilter,
    withoutNextActionFilter,
    lastActivityKindFilter,
    userStatusFilter,
  } = useContactsSearchState(from)
  const [debouncedQuery] = useDebounce(query, 250)
  return useMemo(
    () =>
      ({
        q: debouncedQuery.trim() || undefined,
        role: roleFilter,
        company: companyFilter,
        // #2159.26 — l'étiquette, filtrée SERVEUR comme la société.
        tag: tagFilter,
        channel: channelFilter,
        // #1473 — la file « à qualifier ». Filtré SERVEUR, comme les pastilles :
        // filtrer les 25 lignes chargées annoncerait un total faux.
        unassigned: unassignedFilter,
        state: stateFilter,
        // La valeur du filtre EST le nombre de mois : « 12 » veut dire « aucun
        // échange depuis un an ». Une valeur illisible est ignorée plutôt que
        // repliée sur un défaut — un lien partagé ne doit pas changer
        // silencieusement le seuil de quelqu'un.
        dormantMonths: dormantFilter && /^\d+$/.test(dormantFilter) ? Number(dormantFilter) : undefined,
        // #2158.61 — la ville/le pays, filtrée SERVEUR comme la société.
        location: locationFilter,
        // #2158.65 — le porteur du contact, filtré SERVEUR (égalité exacte).
        assignedTo: assignedToFilter,
        // #1903.15 — le compte discuté en conversation, posé par un lien
        // profond de Laura. Égalité SERVEUR exacte, comme `assignedTo`.
        accountId: accountIdFilter,
        // #2158.60 — la famille métier, filtrée SERVEUR (égalité exacte, comme `role`).
        family: familyFilter,
        // #2158.57 — l'entité, filtrée SERVEUR (ILIKE, comme `location`).
        entity: entityFilter,
        // #2158.58 — la fonction, filtrée SERVEUR (ILIKE, distincte de `q`).
        title: titleFilter,
        // #2158.67 — la fraîcheur de la fiche, même garde-fou que `dormantMonths` :
        // une valeur illisible est ignorée plutôt que repliée sur un défaut.
        updatedWithinMonths:
          updatedWithinFilter && /^\d+$/.test(updatedWithinFilter) ? Number(updatedWithinFilter) : undefined,
        // #2158.68 — la cible, filtrée SERVEUR (égalité exacte).
        targetListId: targetListIdFilter,
        // #2834 (#2106.24) — les contacts « a changé d'employeur », posé par
        // un lien profond depuis le brief. Filtré SERVEUR, même geste que
        // `accountId` juste au-dessus.
        sourceTag: sourceTagFilter,
        // #4597.3 — les contacts de CET import, filtrés SERVEUR (égalité exacte sur l'identifiant du job).
        importJob: importJobFilter,
        // #2158.66 — la source, filtrée SERVEUR (égalité exacte, comme `family`).
        source: sourceFilter,
        // #2158.59 — le niveau, filtré SERVEUR (égalité exacte, comme `family`/`source`).
        hierarchyLevel: hierarchyLevelFilter,
        // #2158.14 (#2997) — la vue « Sans prochaine action », filtrée SERVEUR
        // (même geste qu'`unassigned` : présent-ou-absent).
        withoutNextAction: withoutNextActionFilter,
        // #2158.69 (#2997) — la nature de la dernière activité, filtrée SERVEUR.
        lastActivityKind: lastActivityKindFilter,
        // #3718 — le statut déclaré (« Répondu »…), filtré SERVEUR.
        userStatus: userStatusFilter,
      }) satisfies ContactListQuery,
    [
      debouncedQuery,
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
      familyFilter,
      entityFilter,
      titleFilter,
      updatedWithinFilter,
      targetListIdFilter,
      sourceTagFilter,
      importJobFilter,
      sourceFilter,
      hierarchyLevelFilter,
      withoutNextActionFilter,
      lastActivityKindFilter,
      userStatusFilter,
    ],
  )
}
