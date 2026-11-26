import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { ProfileComplementState, SaveAnswers } from '@bellum/contracts'
import { onboardingApi, onboardingKeys } from '@/features/onboarding/api'
import { useSession } from '@/lib/hooks/use-session'

/**
 * Temps 2 — le complément de profil.
 *
 * L'état ne vient JAMAIS du front : c'est le serveur qui sait si une première
 * analyse est terminée, et si l'utilisateur a repoussé ou refusé. Une lecture
 * en échec ne rend rien (`data` absent) → la carte ne s'affiche pas, le produit
 * reste utilisable : un complément facultatif ne casse pas un dashboard.
 */
export function useProfileComplement() {
  const { user } = useSession()
  const queryClient = useQueryClient()

  const state = useQuery<ProfileComplementState, Error>({
    queryKey: onboardingKeys.complement,
    queryFn: () => onboardingApi.getComplement(),
    enabled: !!user,
    staleTime: 60_000,
  })

  const setState = (next: ProfileComplementState): void => {
    queryClient.setQueryData(onboardingKeys.complement, next)
  }

  const snooze = useMutation({ mutationFn: onboardingApi.snoozeComplement, onSuccess: setState })
  const dismiss = useMutation({ mutationFn: onboardingApi.dismissComplement, onSuccess: setState })
  const finish = useMutation({
    mutationFn: onboardingApi.completeComplement,
    onSuccess: next => {
      setState(next)
      // The answers moved — anything reading the ESN profile must re-read.
      void queryClient.invalidateQueries({ queryKey: onboardingKeys.state })
    },
  })

  /** Saves ONE question's answer. Autosave per step: a rep who closes the
   *  dialog mid-way keeps what they already answered. */
  const saveAnswer = useMutation({
    mutationFn: (answers: SaveAnswers) => onboardingApi.saveAnswers(answers),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: onboardingKeys.complement })
    },
  })

  return { state: state.data, snooze, dismiss, finish, saveAnswer }
}
