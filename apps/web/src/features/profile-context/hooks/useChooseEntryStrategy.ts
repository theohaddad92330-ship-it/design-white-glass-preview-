import { useMutation, useQueryClient } from '@tanstack/react-query'
import type { EntryStrategy, ProfileContextResponse } from '@bellum/contracts'
import { profileContextApi, profileContextKeys } from '@/features/profile-context/api'

/**
 * #2073.8 — « Choisir cette stratégie ». PERSISTE le choix de l'utilisateur,
 * distinct du champ CALCULÉ par le profileur (`idealAccountProfile.entryStrategy`).
 *
 * Le clic EST la décision (geste utilisateur = auto-approuvé) : cette
 * mutation part sans confirmation, et sa réponse REMPLACE directement le
 * cache de `GET /profile-context/me` — même précédent que
 * `useValidateProfileContext`.
 */
export function useChooseEntryStrategy() {
  const queryClient = useQueryClient()
  return useMutation<ProfileContextResponse, Error, EntryStrategy>({
    mutationKey: ['profile-context', 'choose-entry-strategy'],
    mutationFn: entryStrategy => profileContextApi.chooseEntryStrategy(entryStrategy),
    onSuccess: data => {
      queryClient.setQueryData(profileContextKeys.me, data)
    },
  })
}
