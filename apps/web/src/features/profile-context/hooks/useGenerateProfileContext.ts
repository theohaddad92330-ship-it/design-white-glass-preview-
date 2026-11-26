import { useMutation, useQueryClient } from '@tanstack/react-query'
import type { EsnAnswers } from '@bellum/contracts'
import { profileContextKeys } from '@/features/profile-context/api'
import { esnProfileApi } from '@/features/profile/api'

export function useGenerateProfileContext() {
  const queryClient = useQueryClient()
  return useMutation<EsnAnswers, Error, void>({
    mutationKey: ['profile-context', 'generate'],
    mutationFn: () => esnProfileApi.regenerateContext(),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: profileContextKeys.me })
    },
  })
}
