import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { FramingDecision, FramingOrientationId, FramingStateResponse } from '@bellum/contracts'
import { onboardingApi, onboardingKeys } from '@/features/onboarding/api'
import { useSession } from '@/lib/hooks/use-session'

/** Théo O onboarding-relecture.N1/N2 — les décisions par orientation et la validation du cadrage. */
export function useFraming() {
  const { user } = useSession()
  return useQuery<FramingStateResponse>({
    queryKey: onboardingKeys.framing,
    queryFn: () => onboardingApi.getFraming(),
    enabled: !!user,
    staleTime: 30_000,
  })
}

export function useSaveFramingDecision() {
  const qc = useQueryClient()
  return useMutation<FramingStateResponse, Error, { orientation: FramingOrientationId; decision: FramingDecision }>({
    mutationKey: ['onboarding', 'framing', 'decision'],
    mutationFn: ({ orientation, decision }) => onboardingApi.saveFramingDecision(orientation, decision),
    onSuccess: state => qc.setQueryData(onboardingKeys.framing, state),
  })
}

export function useValidateFraming() {
  const qc = useQueryClient()
  return useMutation<FramingStateResponse, Error, string>({
    mutationKey: ['onboarding', 'framing', 'validate'],
    mutationFn: digest => onboardingApi.validateFraming(digest),
    onSuccess: state => qc.setQueryData(onboardingKeys.framing, state),
  })
}
