import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { CompanySuggestion, OnboardingStateResponse, SaveAnswers } from '@bellum/contracts'
import { onboardingApi, onboardingKeys } from '@/features/onboarding/api'
import { useSession } from '@/lib/hooks/use-session'

/** Current onboarding state (status, current stage, saved answers, stages). */
export function useOnboardingState() {
  const { user } = useSession()
  return useQuery<OnboardingStateResponse>({
    queryKey: onboardingKeys.state,
    queryFn: () => onboardingApi.getState(),
    enabled: !!user,
    staleTime: 30_000,
  })
}

/**
 * #2626.2 — la première sélection de comptes, à la fin du Temps 1 (écran de
 * relecture). Une seule lecture par visite de l'écran : le profil qui la
 * fonde vient d'être figé, un `staleTime` infini évite de la relancer à
 * chaque focus de fenêtre pour un résultat qui ne peut pas avoir changé.
 */
export function useFirstSelection() {
  const { user } = useSession()
  return useQuery<{ suggestions: CompanySuggestion[] }>({
    queryKey: onboardingKeys.firstSelection,
    queryFn: () => onboardingApi.getFirstSelection(),
    enabled: !!user,
    staleTime: Infinity,
  })
}

export function useSaveAnswers() {
  const qc = useQueryClient()
  return useMutation<OnboardingStateResponse, Error, SaveAnswers>({
    mutationKey: ['onboarding', 'saveAnswers'],
    mutationFn: answers => onboardingApi.saveAnswers(answers),
    onSuccess: state => qc.setQueryData(onboardingKeys.state, state),
  })
}

export function useAdvanceStage() {
  const qc = useQueryClient()
  return useMutation<OnboardingStateResponse, Error, string>({
    mutationKey: ['onboarding', 'advanceStage'],
    mutationFn: stageCode => onboardingApi.advanceStage(stageCode),
    onSuccess: state => qc.setQueryData(onboardingKeys.state, state),
  })
}

/**
 * #2013.7 / #2022.6 — reporter le questionnaire (« Plus tard »).
 *
 * Le seul appelant de `POST /onboarding/skip` côté produit. L'état revient dans
 * le cache comme pour les autres mutations : le garde de route relit
 * `skipped_at` au passage suivant et ne ramène plus personne sur cet écran.
 */
export function useSkipOnboarding() {
  const qc = useQueryClient()
  return useMutation<OnboardingStateResponse, Error, void>({
    mutationKey: ['onboarding', 'skip'],
    mutationFn: () => onboardingApi.skip(),
    onSuccess: state => qc.setQueryData(onboardingKeys.state, state),
  })
}

/**
 * #2022 — le geste EXPLICITE « je veux revoir mes réponses ».
 *
 * Le seul appelant de `POST /onboarding/refresh` côté produit
 * (`ReconfigureAnswersSection`, Réglages › Profil). L'état revient dans le
 * cache comme pour les autres mutations, si bien que le garde de `/onboarding`
 * lit `refresh_required` au saut suivant et ouvre la page de reconfiguration
 * plutôt que de renvoyer au tableau de bord.
 */
export function useRequestOnboardingRefresh() {
  const qc = useQueryClient()
  return useMutation<OnboardingStateResponse, Error, void>({
    mutationKey: ['onboarding', 'refresh'],
    mutationFn: () => onboardingApi.requestRefresh(),
    onSuccess: state => qc.setQueryData(onboardingKeys.state, state),
  })
}

export function useCompleteOnboarding() {
  const qc = useQueryClient()
  return useMutation<OnboardingStateResponse, Error, void>({
    mutationKey: ['onboarding', 'complete'],
    mutationFn: () => onboardingApi.complete(),
    onSuccess: state => qc.setQueryData(onboardingKeys.state, state),
  })
}
