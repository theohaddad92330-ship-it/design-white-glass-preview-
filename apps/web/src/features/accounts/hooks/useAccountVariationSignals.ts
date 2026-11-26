import type { AccountVariationSignal } from '@bellum/contracts'
import { useQuery } from '@tanstack/react-query'
import { accountKeys, accountsApi } from '@/features/accounts/api'
import { useSession } from '@/lib/hooks/use-session'

/** #3920.10 (Louis 15/10) — les quatre signaux de variation d'un compte. `null` = façade non montée : l'écran se tait. */
export function useAccountVariationSignals(accountId: string | undefined) {
  const { user } = useSession()
  return useQuery<AccountVariationSignal[] | null>({
    queryKey: accountKeys.variationSignals(accountId),
    queryFn: async () => {
      const response = await accountsApi.getVariationSignals(accountId!)
      return 'signals' in response ? response.signals : null
    },
    enabled: Boolean(accountId) && !!user,
    staleTime: 5 * 60_000,
    retry: false,
  })
}
