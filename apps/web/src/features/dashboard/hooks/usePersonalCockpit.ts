import { useQuery } from '@tanstack/react-query'
import type { PersonalCockpitResponse } from '@bellum/contracts'
import { saveQuerySnapshot } from '@/lib/cache/idb/query-snapshots'
import { useSession } from '@/lib/hooks/use-session'
import { dashboardApi } from '../api'

/** Empty personal cockpit — the render target while unauthenticated / loading /
 *  on error, so every card degrades to its own empty state (no invented data). */
const EMPTY_PERSONAL_COCKPIT: PersonalCockpitResponse = {
  kpis: { my_accounts: 0, relances_open: 0, relances_overdue: 0, messages_this_week: 0 },
  priorities: [],
  relances: [],
  accounts: [],
  messages: [],
}

type UsePersonalCockpitResult = {
  loading: boolean
  /** Le calcul a échoué : l'écran doit dire l'échec, jamais l'habiller en
   *  zéros (`data` ci-dessous reste l'état vide, pour un rendu qui ne casse
   *  pas, mais un appelant qui affiche des CHIFFRES doit lire `error` d'abord). */
  error: boolean
  data: PersonalCockpitResponse
}

/**
 * Personal cockpit data (roadmap §5 — seat value): my accounts, my relances, my
 * priorities, my messages. Scoped server-side to the current user inside their
 * workspace; the hook only fetches once a session exists.
 */
export function usePersonalCockpit(): UsePersonalCockpitResult {
  const { user } = useSession()
  const queryKey = ['dashboard', 'me', user?.id] as const
  const { data, isLoading, isError } = useQuery({
    queryKey,
    queryFn: async () => {
      const payload = await dashboardApi.me()
      void saveQuerySnapshot(queryKey, payload)
      return payload
    },
    enabled: !!user,
    staleTime: 60_000,
  })

  return { loading: isLoading, error: isError, data: data ?? EMPTY_PERSONAL_COCKPIT }
}
