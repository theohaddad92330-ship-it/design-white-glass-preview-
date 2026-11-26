import { useMutation, useQueryClient } from '@tanstack/react-query'
import type { ProfileContextCorrectableField, ProfileContextResponse } from '@bellum/contracts'
import { profileContextApi, profileContextKeys } from '@/features/profile-context/api'

/**
 * #2908 (#2010.4) — « Corriger ce champ ». PERSISTE une correction humaine sur
 * un champ FERMÉ de `profile_context`, distincte du contenu CALCULÉ par le
 * profileur. Le clic EST la décision (geste utilisateur = auto-approuvé) :
 * cette mutation part sans confirmation, et sa réponse REMPLACE directement le
 * cache de `GET /profile-context/me` — même précédent que
 * `useChooseEntryStrategy`.
 */
export function useCorrectProfileContextField() {
  const queryClient = useQueryClient()
  return useMutation<ProfileContextResponse, Error, { field: ProfileContextCorrectableField; value: string }>({
    mutationKey: ['profile-context', 'correct-field'],
    mutationFn: ({ field, value }) => profileContextApi.correctField(field, value),
    onSuccess: data => {
      queryClient.setQueryData(profileContextKeys.me, data)
    },
  })
}
