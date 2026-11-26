import { useQuery } from '@tanstack/react-query'
import type { OnboardingActivation } from '@bellum/contracts'
import { onboardingApi, onboardingKeys } from '@/features/onboarding/api'
import { useSession } from '@/lib/hooks/use-session'

/**
 * The self-serve activation checklist (`GET /onboarding/activation`) — booleans
 * DERIVED server-side from real data (esn_profiles, analysis_runs,
 * product_events, user_actions, *_connections). Refetched on window focus so
 * the widget picks up progress made in another tab (e.g. a dossier opened
 * elsewhere, or a tool connected from Réglages › Intégrations).
 */
export function useActivation() {
  const { user } = useSession()

  return useQuery<OnboardingActivation, Error>({
    queryKey: onboardingKeys.activation,
    queryFn: () => onboardingApi.getActivation(),
    enabled: !!user,
    staleTime: 15_000,
  })
}
