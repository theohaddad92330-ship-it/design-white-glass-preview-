import { useQuery } from '@tanstack/react-query'
import { accountFactsBriefSchema, type AccountFactsBrief } from '@bellum/contracts'
import { apiFetch } from '@/lib/api'
import { useSession } from '@/lib/hooks/use-session'

/**
 * #4072.3 — la fiche de préparation d'UN compte, lue par le lecteur unique des
 * faits du compte. Une lecture en échec rend `null` : la préparation garde ses
 * autres blocs, elle n'invente rien à la place.
 */
export function useAccountFactsBrief(accountId: string | undefined): AccountFactsBrief | null {
  const { user } = useSession()
  const { data } = useQuery<AccountFactsBrief | null>({
    queryKey: ['account-facts', 'brief', accountId],
    queryFn: async () => {
      const raw = await apiFetch<unknown>({ path: `/account-facts/${accountId}/brief` })
      const parsed = accountFactsBriefSchema.safeParse(raw)
      return parsed.success ? parsed.data : null
    },
    enabled: Boolean(accountId) && !!user,
    staleTime: 5 * 60_000,
    retry: false,
  })
  return data ?? null
}
