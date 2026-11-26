import { useMutation, useQueryClient } from '@tanstack/react-query'
import type { EsnAnswers } from '@bellum/contracts'
import { profileContextKeys } from '@/features/profile-context/api'
import { esnProfileApi } from '@/features/profile/api'

export function useRegenerateProfileContext() {
  const queryClient = useQueryClient()
  return useMutation<EsnAnswers, Error, void>({
    mutationKey: ['profile-context', 'regenerate'],
    mutationFn: () => esnProfileApi.regenerateContext(),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: profileContextKeys.me })
      // A regeneration snapshots a new revision — refresh the « Versions » panel.
      void queryClient.invalidateQueries({ queryKey: profileContextKeys.revisions })
    },
  })
}
