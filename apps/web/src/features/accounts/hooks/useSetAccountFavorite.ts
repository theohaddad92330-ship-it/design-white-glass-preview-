import type { AccountFavoriteState, AccountListResponse } from '@bellum/contracts'
import type { InfiniteData, Query } from '@tanstack/react-query'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { i18n } from '@/i18n'
import { accountsApi } from '@/features/accounts/api'

/** Toutes les combinaisons de filtres du portefeuille (`accountKeys.list(userId)`
 *  + `filters`) sont cachées SÉPARÉMENT — voir `useAccounts`. Un favori posé
 *  sur une ligne doit donc se voir dans TOUTES, pas seulement celle qui a
 *  l'onglet ouvert : deux onglets sur deux vues du même portefeuille ne
 *  doivent pas se contredire. */
function isAccountsListQuery(query: Query): boolean {
  return query.queryKey[0] === 'accounts' && query.queryKey[1] === 'list'
}

type ListSnapshot = { queryKey: readonly unknown[]; data: InfiniteData<AccountListResponse> | undefined }

/**
 * #2150.14/.18 — L'ÉTOILE DE LIGNE, MISE À JOUR OPTIMISTE.
 *
 * Un clic doit se voir à l'instant — attendre l'aller-retour serveur pour
 * qu'une étoile se remplisse la rendrait molle. `onMutate` écrit donc la
 * valeur AVANT la réponse, dans TOUTES les pages en cache ; `onError` remet
 * EXACTEMENT ce qui y était (un instantané par requête, pas une simple
 * inversion du booléen — deux clics rapides sur deux comptes ne doivent pas
 * se marcher dessus).
 */
export function useSetAccountFavorite() {
  const qc = useQueryClient()

  return useMutation<AccountFavoriteState, Error, { id: string; next: boolean }, { snapshots: ListSnapshot[] }>({
    mutationFn: ({ id, next }) => accountsApi.setFavorite(id, next),
    onMutate: async ({ id, next }) => {
      await qc.cancelQueries({ predicate: isAccountsListQuery })

      const snapshots: ListSnapshot[] = qc
        .getQueriesData<InfiniteData<AccountListResponse>>({ predicate: isAccountsListQuery })
        .map(([queryKey, data]) => ({ queryKey, data }))

      qc.setQueriesData<InfiniteData<AccountListResponse>>({ predicate: isAccountsListQuery }, old => {
        if (!old) return old
        return {
          ...old,
          pages: old.pages.map(page => ({
            ...page,
            data: page.data.map(item => (item.id === id ? { ...item, is_favorite: next } : item)),
          })),
        }
      })

      return { snapshots }
    },
    onError: (_error, _vars, context) => {
      context?.snapshots.forEach(({ queryKey, data }) => qc.setQueryData(queryKey, data))
      toast.error(i18n.t('accounts:list.favorite.error'))
    },
  })
}
