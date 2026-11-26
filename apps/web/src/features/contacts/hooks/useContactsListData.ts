import { useMemo } from 'react'
import type {
  ContactLifecycleTally,
  ContactListQuery,
  ContactListResponse,
  ContactRejectionReasons,
  ContactPreCreationExclusions,
  ContactRecommendedTally,
  ContactChannelTally,
} from '@bellum/contracts'
import { useContacts, type GlobalContact } from './useContacts'

type ContactsListData = {
  contacts: GlobalContact[]
  /** `undefined` tant que ce n'est pas mesuré (chargement OU échec réseau) —
   *  jamais `0`. #2091 : un échec réseau faisait afficher « Tous 0 » à
   *  `ContactsLifecycleFilter`, qui accepte pourtant déjà `undefined`. */
  totalContacts: number | undefined
  /** Compteurs par état sur TOUT le jeu filtré, servis par l'API sur la 1re
   *  page. `undefined` (ancien snapshot IndexedDB, ou agrégat en échec) ⇒ les
   *  pastilles s'affichent SANS compteur, jamais avec un chiffre faux. */
  lifecycleTally: ContactLifecycleTally | undefined
  /** Contacts créés depuis sept jours, sur la MÊME population que le tally. */
  lifecycleWeeklyNet: number | undefined
  /** #2934 — pourquoi un contact est écarté, par raison réelle, sur la MÊME
   *  population. `undefined` ⇒ aucune ligne de raison. */
  rejectionReasons: ContactRejectionReasons | undefined
  /** #2309.16/.19 — pourquoi un candidat n'est jamais devenu une fiche, sur
   *  tout l'espace. `undefined` ⇒ l'écran n'affiche AUCUNE ligne. */
  preCreationExclusions: ContactPreCreationExclusions | undefined
  /** #3942.2 — le compteur « Recommandés X / Tous Y », calculé par l'API
   *  UNIQUEMENT quand `recommendedScope=recommended` est posé. `undefined`
   *  sinon (ou en échec) ⇒ le bandeau n'affiche aucun chiffre pour « Tous ». */
  recommendedTally: ContactRecommendedTally | undefined
  /** #4527.1 — les chiffres des tuiles / puces, comptés par l'API sur la population de la liste.
   *  `undefined` (chargement, échec, ancien snapshot) ⇒ aucun chiffre, jamais « 0 ». */
  channelTally: ContactChannelTally | undefined
  isLoading: boolean
  isError: boolean
  isFetchingNextPage: boolean
  hasNextPage: boolean | undefined
  fetchNextPage: () => Promise<unknown>
  /** Théo B c1-repertoire — « Réessayer » sur l'état d'erreur. */
  refetch: () => Promise<unknown>
  /** #3701.3 — charge la page suivante et rend les lignes CUMULÉES (« Tous les résultats »). */
  loadNextPageRows: () => Promise<{ rows: GlobalContact[]; hasNextPage: boolean; failed: boolean }>
}

function dedupePages(data: { pages: ContactListResponse[] } | undefined): GlobalContact[] {
  if (!data?.pages) return []
  return [...new Map(data.pages.flatMap(p => p.data).map(c => [c.id, c])).values()]
}

export function useContactsListData(filters: ContactListQuery): ContactsListData {
  const query = useContacts(filters)
  const contacts = useMemo(() => dedupePages(query.data), [query.data])
  // #2091 — `?? 0` faisait d'un échec réseau (`isError`, `data` absent) un
  // total MESURÉ à zéro. `isError` propage `undefined`, jamais un chiffre.
  const totalContacts = query.isError ? undefined : query.data?.pages[0]?.pagination.totalItems
  const lifecycleTally = query.data?.pages[0]?.lifecycleTally
  const lifecycleWeeklyNet = query.data?.pages[0]?.lifecycleWeeklyNet
  const rejectionReasons = query.data?.pages[0]?.rejectionReasons
  const preCreationExclusions = query.data?.pages[0]?.preCreationExclusions
  const recommendedTally = query.data?.pages[0]?.recommendedTally
  const channelTally = query.isError ? undefined : query.data?.pages[0]?.channelTally
  return {
    contacts,
    totalContacts,
    lifecycleTally,
    lifecycleWeeklyNet,
    rejectionReasons,
    preCreationExclusions,
    recommendedTally,
    channelTally,
    isLoading: query.isLoading,
    isError: query.isError,
    isFetchingNextPage: query.isFetchingNextPage,
    hasNextPage: query.hasNextPage,
    fetchNextPage: query.fetchNextPage,
    // Théo B c1-repertoire — « Réessayer » sur l’état d’erreur : relance la même requête.
    refetch: query.refetch,
    loadNextPageRows: async () => {
      try {
        const result = await query.fetchNextPage()
        return { rows: dedupePages(result.data), hasNextPage: Boolean(result.hasNextPage), failed: result.isError }
      } catch {
        return { rows: [], hasNextPage: false, failed: true }
      }
    },
  }
}
