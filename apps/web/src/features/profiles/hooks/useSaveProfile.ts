import { useMutation, useQueryClient } from '@tanstack/react-query'
import type { UserProfile, UpdateProfile } from '@bellum/contracts'
import { profileContextKeys } from '@/features/profile-context/api'
import { profileApi } from '@/features/profiles/api'

export function useSaveProfile() {
  const qc = useQueryClient()
  return useMutation<UserProfile, Error, UpdateProfile>({
    mutationKey: ['profile', 'save'],
    mutationFn: update => profileApi.updateMe(update),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['profile'] })
      void qc.invalidateQueries({ queryKey: profileContextKeys.me })
    },
  })
}
