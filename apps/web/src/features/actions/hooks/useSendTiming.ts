import type { SendTiming } from '@bellum/contracts'
import { useQuery } from '@tanstack/react-query'
import { useSession } from '@/lib/hooks/use-session'
import { planItemsApi } from '../planItems.api'

/**
 * #3289 (#3264.31/.32/.33) — le créneau d'envoi appris par l'espace. Clé sous
 * `['plan-items']` : cocher une relance faite (avec son issue) invalide le
 * préfixe, donc la mesure se relit avec le geste qui vient de l'enrichir.
 */
export function useSendTiming() {
  const { user } = useSession()
  return useQuery<SendTiming | null>({
    queryKey: ['plan-items', 'send-timing', user?.id],
    queryFn: () => planItemsApi.sendTiming(),
    enabled: Boolean(user),
    staleTime: 5 * 60_000,
  })
}
