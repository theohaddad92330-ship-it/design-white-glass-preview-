import { useQuery } from '@tanstack/react-query'
import { knownPeopleSchema, type KnownPeople } from '@bellum/contracts'
import { apiFetch } from '@/lib/api'
import { useSession } from '@/lib/hooks/use-session'

/**
 * #4072.1 — les personnes que l'espace connaît déjà chez ce compte (contacts du
 * CRM, interlocuteurs de missions passées), lues par le lecteur unique des faits
 * du compte. Une lecture en échec rend `null` : l'organigramme garde son ordre
 * d'avant, il ne marque personne par défaut.
 */
export function useKnownPeople(accountId: string | undefined): KnownPeople | null {
  const { user } = useSession()
  const { data } = useQuery<KnownPeople | null>({
    queryKey: ['account-facts', 'known-people', accountId],
    queryFn: async () => {
      const parsed = knownPeopleSchema.safeParse(
        await apiFetch<unknown>({ path: `/account-facts/${accountId}/known-people` }),
      )
      return parsed.success ? parsed.data : null
    },
    enabled: Boolean(accountId) && !!user,
    staleTime: 5 * 60_000,
    retry: false,
  })
  return data ?? null
}
