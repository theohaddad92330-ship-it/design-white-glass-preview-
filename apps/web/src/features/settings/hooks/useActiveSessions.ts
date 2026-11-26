import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { authApi } from '@/features/auth/api'

const SESSIONS_KEY = ['auth', 'sessions'] as const

/** Active devices for the current user (anti password-sharing cap = 2). */
export function useActiveSessions() {
  return useQuery({
    queryKey: SESSIONS_KEY,
    queryFn: () => authApi.listSessions(),
    staleTime: 30_000,
  })
}

/** Revoke (sign out) another device, then refresh the list. */
export function useRevokeSession() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => authApi.revokeSession(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: SESSIONS_KEY }),
  })
}
