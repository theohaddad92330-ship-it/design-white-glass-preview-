import { useQuery } from '@tanstack/react-query'
import type { Account } from '@bellum/contracts'
import { accountKeys, accountsApi } from '@/features/accounts/api'
import { useSession } from '@/lib/hooks/use-session'

/**
 * #3637 (R2 07/10) — le dossier d'analyse du compte (`raw_analysis`) pour une
 * fiche qui n'a que le contact : « Préparer mon appel » ouvrait l'éditeur avec
 * un dossier VIDE, donc jamais d'objection à anticiper. Même clé que `useAccount`
 * (le cache est partagé, aucune seconde requête quand le compte est déjà là).
 * Sans compte (contact à qualifier) ou sans dossier : `undefined`, jamais un faux.
 */
export function useAccountRawAnalysis(accountId: string | null | undefined): Record<string, unknown> | undefined {
  const { user } = useSession()
  const { data } = useQuery<Account>({
    queryKey: accountKeys.detail(accountId ?? ''),
    queryFn: () => accountsApi.getOne(accountId!),
    enabled: Boolean(accountId) && !!user,
    staleTime: 60_000,
  })
  const raw = data?.raw_analysis
  return raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : undefined
}
