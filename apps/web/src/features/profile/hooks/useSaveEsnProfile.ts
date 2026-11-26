import { useMutation, useQueryClient } from '@tanstack/react-query'
import type { EsnAnswers, SaveAnswers } from '@bellum/contracts'
import { esnProfileApi, esnProfileKeys } from '@/features/profile/api'

/** Upserts a partial ESN answer set (PUT /esn-profile) and refreshes the cache. */
export function useSaveEsnProfile() {
  const qc = useQueryClient()
  return useMutation<EsnAnswers, Error, SaveAnswers>({
    mutationKey: ['esn-profile', 'save'],
    mutationFn: answers => esnProfileApi.updateMine(answers),
    onSuccess: answers => {
      qc.setQueryData(esnProfileKeys.mine, answers)
      // #3386 — le rôle métier déclaré réordonne le brief : l'écran le relit au
      // lieu de servir l'ordre d'avant jusqu'au prochain rafraîchissement.
      void qc.invalidateQueries({ queryKey: ['briefing'] })
    },
  })
}
