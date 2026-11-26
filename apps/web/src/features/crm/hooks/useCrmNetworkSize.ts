import { useQuery } from '@tanstack/react-query'
import { crmApi, type CrmNetworkSize } from '@/features/crm/api'
import { useSession } from '@/lib/hooks/use-session'

/**
 * #2045.5 (épopée #2859) — le total PORTAIL du CRM branché à l'espace, pour
 * l'onboarding (`ReseauExternalReads`). Un espace sans CRM connecté obtient
 * `provider: null, total: null` — le composant qui consomme ce hook reste
 * alors silencieux (aucun texte, jamais un « 0 » inventé).
 */
export function useCrmNetworkSize() {
  const { user } = useSession()

  return useQuery<CrmNetworkSize>({
    queryKey: ['crm', 'network-size'],
    queryFn: () => crmApi.networkSize(),
    enabled: !!user,
    staleTime: 5 * 60_000,
  })
}
