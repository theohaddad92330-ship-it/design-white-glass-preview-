import type { WeeklyStats } from '@bellum/contracts'
import { useQuery } from '@tanstack/react-query'
import { actionsApi } from '@/features/actions/api'
import { useSession } from '@/lib/hooks/use-session'

const DEFAULTS: WeeklyStats = {
  messages_sent: 0,
  messages_breakdown: { verified: 0, declared: 0, unattributed: 0, total: 0 },
  messages_copied: 0,
  responses: 0,
  rdv_obtained: 0,
  response_rate: '0%',
}

export function useWeeklyStats() {
  const { user } = useSession()
  return useQuery<WeeklyStats>({
    queryKey: ['actions', 'weekly-stats', user?.id],
    queryFn: () => actionsApi.weeklyStats(),
    enabled: !!user,
    staleTime: 60_000,
    placeholderData: DEFAULTS,
  })
}
