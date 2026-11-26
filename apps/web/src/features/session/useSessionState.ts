import { useQuery } from '@tanstack/react-query'
import type { SessionLifecycleState } from '@bellum/contracts'
import { apiFetch } from '@/lib/api'
import { useSession } from '@/lib/hooks/use-session'

const SESSION_STATE_KEY = ['session', 'state'] as const

function fetchSessionState(): Promise<SessionLifecycleState> {
  return apiFetch<SessionLifecycleState>({ path: '/auth/session/state' })
}

export function useSessionState() {
  const { user } = useSession()
  return useQuery<SessionLifecycleState>({
    queryKey: SESSION_STATE_KEY,
    queryFn: fetchSessionState,
    enabled: !!user,
    staleTime: 60_000,
  })
}
