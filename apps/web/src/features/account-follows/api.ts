import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { accountFollowStateSchema, accountFollowsResponseSchema, type AccountFollowsResponse } from '@bellum/contracts'
import { apiFetch } from '@/lib/api'
import { useSession } from '@/lib/hooks/use-session'

/**
 * #4267 — le suivi explicite d'un compte. Parsé à la frontière : une API antérieure au module
 * rend un 404, converti en échec de requête nommé plutôt qu'en écran faux.
 */
const ACCOUNT_FOLLOWS_KEY = ['account-follows'] as const

export function useAccountFollows() {
  const { user } = useSession()
  return useQuery<AccountFollowsResponse>({
    queryKey: [...ACCOUNT_FOLLOWS_KEY, user?.id],
    enabled: Boolean(user?.id),
    queryFn: async () => accountFollowsResponseSchema.parse(await apiFetch<unknown>({ path: '/account-follows' })),
  })
}

/** « Suivre » / « Ne plus suivre ». Un refus de plafond (409) remonte en `ApiError` avec son code. */
export function useToggleAccountFollow() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ accountId, follow }: { accountId: string; follow: boolean }) =>
      accountFollowStateSchema.parse(
        await apiFetch<unknown>({ path: `/accounts/${accountId}/follow`, method: follow ? 'POST' : 'DELETE' }),
      ),
    onSettled: () => queryClient.invalidateQueries({ queryKey: ACCOUNT_FOLLOWS_KEY }),
  })
}

/** 4267.4 — la notice de reprise est lue : elle ne revient plus. */
export function useMarkMigrationNoticeSeen() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async () => {
      await apiFetch<void>({ path: '/account-follows/migration-notice/seen', method: 'POST' })
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: ACCOUNT_FOLLOWS_KEY }),
  })
}
