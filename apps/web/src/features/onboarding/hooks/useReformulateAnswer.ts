import { useMutation, type UseMutationResult } from '@tanstack/react-query'
import type { OnboardingReformulateRequest, OnboardingReformulateResponse } from '@bellum/contracts'
import { onboardingApi } from '@/features/onboarding/api'

/**
 * #2060.9 — « Laura reformule, l'utilisateur valide avant enregistrement ».
 *
 * A mutation, never a query: it fires on the EXPLICIT « Reformuler avec
 * Laura » click only — never on mount, never on remount/refocus. Écrit rien
 * server-side (voir `OnboardingController.reformulateAnswer`) : c'est
 * `saveAnswers` qui persiste ce que l'utilisateur choisit ensuite.
 */
export function useReformulateAnswer(): UseMutationResult<
  OnboardingReformulateResponse,
  Error,
  OnboardingReformulateRequest
> {
  return useMutation<OnboardingReformulateResponse, Error, OnboardingReformulateRequest>({
    mutationKey: ['onboarding', 'reformulateAnswer'],
    mutationFn: input => onboardingApi.reformulateAnswer(input),
  })
}
