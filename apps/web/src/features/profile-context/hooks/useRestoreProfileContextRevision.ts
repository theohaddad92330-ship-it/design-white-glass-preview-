import { useMutation, useQueryClient } from '@tanstack/react-query'
import type { ProfileContextRevision } from '@bellum/contracts'
import { profileContextApi, profileContextKeys } from '@/features/profile-context/api'

/**
 * Restore a past profile-context snapshot as the current one. Reversible (the
 * restore snapshots a fresh revision server-side) but confirmed at the click.
 * On success we refetch both the current context and the revision list.
 */
export function useRestoreProfileContextRevision() {
  const queryClient = useQueryClient()
  return useMutation<ProfileContextRevision, Error, number>({
    mutationKey: ['profile-context', 'restore'],
    mutationFn: (version: number) => profileContextApi.restoreRevision(version),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: profileContextKeys.me })
      void queryClient.invalidateQueries({ queryKey: profileContextKeys.revisions })
    },
  })
}
