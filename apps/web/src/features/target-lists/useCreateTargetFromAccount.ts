import type { TargetList } from '@bellum/contracts'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { i18n } from '@/i18n'
import { targetListsApi } from './api'

const TARGET_LISTS_KEY = ['target-lists'] as const

type CreateTargetFromAccountInput = {
  accountId: string
  /** `null`/vide retombe sur un nom générique plutôt qu'une liste sans titre. */
  companyName: string | null
}

/**
 * #2164.44 — « Créer une cible » depuis le dossier compte.
 *
 * `target-lists.service.ts` existait déjà — LOT « Mes cibles » (#2155/#2156)
 * — mais aucun appelant ne le déclenchait depuis le dossier d'un compte
 * analysé : le geste correctif de lecture inerte cité au registre. Ce hook
 * compose les DEUX écritures déjà exposées ({@link targetListsApi.create} et
 * {@link targetListsApi.addItem}, réutilisées telles quelles — GA-26) en un
 * seul geste nommé : une liste NEUVE, seedée avec ce compte comme premier
 * élément, `source`/`provenance: 'analysis'` (elle naît d'un dossier
 * analysé, pas d'une recherche manuelle dans « Mes cibles »).
 */
export function useCreateTargetFromAccount() {
  const queryClient = useQueryClient()

  return useMutation<TargetList, Error, CreateTargetFromAccountInput>({
    mutationKey: ['target-lists', 'create-from-account'],
    mutationFn: async ({ accountId, companyName }) => {
      const name = companyName?.trim() || i18n.t('accounts:cta.moreActions.createTarget.fallbackName')
      const list = await targetListsApi.create({ name, source: 'analysis' })
      await targetListsApi.addItem(list.id, { kind: 'account', ref_id: accountId, provenance: 'analysis' })
      return list
    },
    onSuccess: (list, { companyName }) => {
      queryClient.invalidateQueries({ queryKey: TARGET_LISTS_KEY })
      toast.success(
        i18n.t('accounts:cta.moreActions.createTarget.success', {
          company: companyName?.trim() || i18n.t('accounts:cta.moreActions.thisAccount'),
          list: list.name,
        }),
      )
    },
    onError: error => {
      toast.error(i18n.t('accounts:cta.moreActions.createTarget.error'), { description: error.message })
    },
  })
}
