import { useQuery } from '@tanstack/react-query'
import type { RecentSignal } from '@bellum/contracts'
import { accountsApi } from '@/features/accounts/api'
import { crmSignalsForWatch } from '@/features/accounts/model/crmSignals'
import { useSession } from '@/lib/hooks/use-session'

/**
 * #3918.b — les signaux CRM d'UN compte (affaire perdue, dormante, à
 * renouveler), rattachés par la jointure deal → compte (#3918.a, jamais par
 * nom). Une lecture en échec rend une liste vide : la veille garde les
 * signaux de l'analyse, elle n'invente rien à la place.
 *
 * #3918.2 (r40) — UNE seule lecture (même clé de cache) pour deux usages : les signaux
 * (`useAccountCrmSignals`) et l'explication d'une liste vide (`useAccountCrmCoverage`).
 */
function useCrmRead(accountId: string | undefined) {
  const { user } = useSession()
  return useQuery({
    queryKey: ['accounts', 'crm-signals', accountId],
    queryFn: () => accountsApi.getCrmSignals(accountId!),
    enabled: Boolean(accountId) && !!user,
    staleTime: 5 * 60_000,
    retry: false,
  })
}

export function useAccountCrmSignals(accountId: string | undefined): RecentSignal[] {
  const { data } = useCrmRead(accountId)
  return data ? crmSignalsForWatch(data.items) : []
}

/** `true` UNIQUEMENT quand un CRM est branché, la lecture a réussi et AUCUNE affaire n'est rattachée au compte. */
export function useAccountHasNoLinkedCrmDeal(accountId: string | undefined): boolean {
  const { data } = useCrmRead(accountId)
  return data !== undefined && data.crmConnected && data.linkedDeals === 0
}
