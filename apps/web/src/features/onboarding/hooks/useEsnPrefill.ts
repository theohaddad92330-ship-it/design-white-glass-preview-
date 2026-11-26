import { useMutation, type UseMutationResult } from '@tanstack/react-query'
import type { EsnPrefillRequest, EsnPrefillResponse } from '@bellum/contracts'
import { onboardingApi } from '@/features/onboarding/api'

/**
 * Resolves the ESN identity + a first pass of questionnaire answers from the
 * company name typed on the first onboarding screen.
 *
 * A mutation (not a query) on purpose: it fires on an explicit user action and
 * must never re-run on remount/refocus — the user has already moved on to the
 * questionnaire by then, and a silent re-fetch would be pure cost.
 */
export function useEsnPrefill(): UseMutationResult<EsnPrefillResponse, Error, EsnPrefillRequest> {
  return useMutation<EsnPrefillResponse, Error, EsnPrefillRequest>({
    mutationKey: ['onboarding', 'esnPrefill'],
    mutationFn: input => onboardingApi.prefill(input),
  })
}
