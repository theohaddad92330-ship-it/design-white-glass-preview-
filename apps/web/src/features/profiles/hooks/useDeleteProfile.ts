import { useMutation, useQueryClient } from '@tanstack/react-query'
import { profileApi } from '@/features/profiles/api'

/**
 * Deletes the profile row for the current user. The caller's session is NOT
 * touched here — pair this with `useDeleteAccount` (which also logs out) for
 * full account removal.
 */
export function useDeleteProfile() {
  const qc = useQueryClient()
  return useMutation<void, Error, void>({
    mutationKey: ['profile', 'delete'],
    mutationFn: () => profileApi.deleteMe(),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['profile'] })
    },
  })
}
