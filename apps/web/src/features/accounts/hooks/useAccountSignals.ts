import { useQuery } from '@tanstack/react-query'
import type { AccountSignalItem } from '@bellum/contracts'
import { accountsApi, accountKeys } from '@/features/accounts/api'
import { useSession } from '@/lib/hooks/use-session'

export function useAccountSignals() {
  const { user } = useSession()

  return useQuery<AccountSignalItem[]>({
    queryKey: accountKeys.signals(user?.id),
    queryFn: accountsApi.listSignals,
    enabled: !!user,
    staleTime: 30_000,
  })
}
