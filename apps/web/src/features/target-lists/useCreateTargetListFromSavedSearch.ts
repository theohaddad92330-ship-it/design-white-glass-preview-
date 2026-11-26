import type { TargetList } from '@bellum/contracts'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { i18n } from '@/i18n'
import type { DiscoverCandidate } from '@/features/discover/lib/discover-types'
import type { SavedSearch } from '@/features/discover/lib/discover-saved-searches'
import { addCandidatesToTargetList, searchCandidatesForSavedSearch } from './fill-target-list-from-search'
import { targetListsApi } from './api'

const TARGET_LISTS_KEY = ['target-lists'] as const

type CreateTargetListFromSavedSearchInput = {
  search: SavedSearch
  /** #2157.57 — les candidats RETENUS dans l'aperçu : la recherche a déjà été jouée (et relue) par l'utilisateur,
   *  on ne la rejoue pas. Absent = l'ancien chemin (chercher puis créer d'un trait). */
  candidates?: readonly DiscoverCandidate[]
}

interface CreateTargetListFromSavedSearchResult {
  list: TargetList
  /** Comptes effectivement versés dans la cible. */
  addedCount: number
  /** Ce que la recherche a renvoyé, AVANT le versement — distingue « rien
   *  trouvé » d'un échec technique sur ce qui a été trouvé. */
  foundCount: number
  /** Candidats trouvés qu'un échec technique isolé (portefeuille ou ajout à
   *  la cible) a empêché de verser — NOMMÉ, jamais un silence (#3075 bis). */
  failedCount: number
}

/**
 * #3075 — « Créer une cible depuis une recherche enregistrée ».
 *
 * Bis : le premier correctif (e0c4b4fb) ne versait que les candidats DÉJÀ des
 * comptes de l'espace (`accountId` non nul, `discover-selection.ts`) — en
 * recette du 26/09, une recherche à 14 résultats n'a versé qu'1 compte, sans
 * message sur les 13 autres. C'était le mauvais chemin à réutiliser :
 * `AddToTargetListDialog` exclut volontairement l'inéligible pour une
 * sélection MANUELLE (l'utilisateur choisit, #2166.55/.76), mais une
 * recherche enregistrée n'a personne pour choisir — chaque résultat qu'elle
 * affiche doit pouvoir finir dans la cible.
 *
 * Le versement lui-même vit dans {@link addCandidatesToTargetList}, PARTAGÉ
 * avec {@link useRefillTargetListFromSavedSearch} (le rattrapage d'une cible
 * déjà créée mais restée incomplète) — un seul chemin, jamais deux.
 */
export function useCreateTargetListFromSavedSearch() {
  const queryClient = useQueryClient()

  return useMutation<CreateTargetListFromSavedSearchResult, Error, CreateTargetListFromSavedSearchInput>({
    mutationKey: ['target-lists', 'create-from-saved-search'],
    mutationFn: async ({ search, candidates: previewed }) => {
      // La recherche part AVANT la création de la liste : un échec de
      // recherche ne doit jamais laisser une cible orpheline côté serveur.
      // #2157.57 — depuis l'aperçu, les candidats retenus arrivent déjà : rien n'est rejoué.
      const candidates = previewed ?? (await searchCandidatesForSavedSearch(search.filters))

      const list = await targetListsApi.create({
        name: search.label,
        objective: search.objective,
        source: 'saved_search',
        source_query: search.filters as unknown as Record<string, unknown>,
      })

      const { addedCount, foundCount, failedCount } = await addCandidatesToTargetList(list.id, candidates, new Set())

      return { list, addedCount, foundCount, failedCount }
    },
    onSuccess: ({ list, addedCount, foundCount, failedCount }, { search }) => {
      queryClient.invalidateQueries({ queryKey: TARGET_LISTS_KEY })
      const description =
        failedCount > 0
          ? i18n.t('discover:sidebar.savedCreateTargetPartial', {
              count: failedCount,
              added: addedCount,
              found: foundCount,
            })
          : addedCount > 0
            ? i18n.t('discover:sidebar.savedCreateTargetAdded', { count: addedCount })
            : i18n.t('discover:sidebar.savedCreateTargetEmpty')
      toast.success(i18n.t('discover:sidebar.savedCreateTargetSuccess', { name: search.label, list: list.name }), {
        description,
        action: {
          label: i18n.t('discover:targetDialog.seeTargetLists'),
          onClick: () => {
            // Import dynamique : `@/router` importe `routeTree.gen`, qui importe
            // TOUTES les routes — même raison que `AddToTargetListDialog.tsx`.
            void import('@/router').then(({ router }) => {
              void router.navigate({ to: '/accounts', search: { lens: 'lists' } })
            })
          },
        },
      })
    },
    onError: error => {
      toast.error(i18n.t('discover:sidebar.savedCreateTargetError'), { description: error.message })
    },
  })
}
