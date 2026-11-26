import { useQuery } from '@tanstack/react-query'
import { apiFetch } from '@/lib/api'
import { useSession } from '@/lib/hooks/use-session'

/**
 * #2045.8 (épopée #2859) — combien de missions cet espace a DÉJÀ tracées,
 * tous comptes confondus, pour l'onboarding (`ReseauExternalReads`). Un
 * espace tout neuf rend honnêtement `0` — un vrai zéro mesuré, jamais une
 * bande auto-déclarée (voir `CapitalisationService.workspaceMissionCount`).
 */
export function useCapitalisationWorkspaceSummary() {
  const { user } = useSession()

  return useQuery<{ missionCount: number }>({
    queryKey: ['capitalisation', 'workspace-summary'],
    queryFn: () => apiFetch<{ missionCount: number }>({ path: '/capitalisation/workspace-summary' }),
    enabled: !!user,
    staleTime: 5 * 60_000,
  })
}
