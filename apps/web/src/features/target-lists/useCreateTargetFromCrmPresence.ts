import type { TargetList } from '@bellum/contracts'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { i18n } from '@/i18n'
import { targetListsApi } from './api'

const TARGET_LISTS_KEY = ['target-lists'] as const

type CreateTargetFromCrmPresenceInput = {
  accountId: string
  /** `null`/vide retombe sur un nom générique plutôt qu'une liste sans titre. */
  companyName: string | null
}

/**
 * Épopée #2853 (#2157.7) — « Créer une cible » depuis le connecteur CRM.
 *
 * Le MÊME geste que `useCreateTargetFromAccount.ts` (#2164.44, la surface
 * « Analyser ») — les deux mutations déjà exposées ({@link targetListsApi.create}
 * et {@link targetListsApi.addItem}, réutilisées telles quelles, GA-26) —
 * seules `source`/`provenance` changent (`'crm'`, jamais `'analysis'` : les
 * deux surfaces sont routées séparément par l'épopée #2853). Le rendu du
 * bouton qui appelle ce hook (`AccountDetailMoreActionsMenu.tsx`) est
 * conditionné à `useCrmPresence(...).data?.matched` — la même donnée que
 * `CrmPresenceBadge` : sans connecteur CRM branché ou sans correspondance
 * sur ce compte, le geste reste absent (no-op strict), jamais proposé sur
 * une donnée devinée.
 */
export function useCreateTargetFromCrmPresence() {
  const queryClient = useQueryClient()

  return useMutation<TargetList, Error, CreateTargetFromCrmPresenceInput>({
    mutationKey: ['target-lists', 'create-from-crm-presence'],
    mutationFn: async ({ accountId, companyName }) => {
      const name = companyName?.trim() || i18n.t('accounts:cta.moreActions.createTargetFromCrm.fallbackName')
      const list = await targetListsApi.create({ name, source: 'crm' })
      await targetListsApi.addItem(list.id, { kind: 'account', ref_id: accountId, provenance: 'crm' })
      return list
    },
    onSuccess: (list, { companyName }) => {
      queryClient.invalidateQueries({ queryKey: TARGET_LISTS_KEY })
      toast.success(
        i18n.t('accounts:cta.moreActions.createTargetFromCrm.success', {
          company: companyName?.trim() || i18n.t('accounts:cta.moreActions.thisAccount'),
          list: list.name,
        }),
      )
    },
    onError: error => {
      toast.error(i18n.t('accounts:cta.moreActions.createTargetFromCrm.error'), { description: error.message })
    },
  })
}
