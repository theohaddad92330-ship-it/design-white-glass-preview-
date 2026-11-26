import { useMutation, useQueryClient } from '@tanstack/react-query'
import type { ProfileContextRegenerableSection, ProfileContextResponse } from '@bellum/contracts'
import { profileContextKeys } from '@/features/profile-context/api'
import { esnProfileApi } from '@/features/profile/api'

/**
 * #2908 (#2010.16 / #2011.10) — « Régénérer cette section ». Attendue en
 * entier (pas de suivi socket dédié, contrairement à `useRegenerateProfileContext`
 * qui suit une génération complète en tâche de fond) : la réponse REMPLACE
 * directement le cache de `GET /profile-context/me`, même précédent que
 * `useCorrectProfileContextField`. Une régénération pose une nouvelle
 * révision (`persistSuccess` → `recordNewVersion`) — le panneau « Versions »
 * est donc invalidé lui aussi, même geste que `useRegenerateProfileContext`.
 */
export function useRegenerateProfileContextSection() {
  const queryClient = useQueryClient()
  return useMutation<ProfileContextResponse, Error, ProfileContextRegenerableSection>({
    mutationKey: ['profile-context', 'regenerate-section'],
    mutationFn: section => esnProfileApi.regenerateContextSection(section),
    onSuccess: data => {
      queryClient.setQueryData(profileContextKeys.me, data)
      void queryClient.invalidateQueries({ queryKey: profileContextKeys.revisions })
    },
  })
}
