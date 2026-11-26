import { useQuery } from '@tanstack/react-query'
import type { AccountSignalLines } from '@bellum/contracts'
import { apiFetch } from '@/lib/api'

/**
 * #4755 / #4756 (lot 761) — les lignes du tableau « Signaux et besoins » d'un compte : UNE lecture pour les quatre
 * familles (`GET /accounts/:id/signal-lines`). Remplace les treize lectures de l'ancien écran (signaux CRM lus
 * trois fois, `/projects?account_id` lu par quatre composants, la fraîcheur deux fois).
 */
export function useAccountSignalLines(accountId: string) {
  return useQuery<AccountSignalLines>({
    queryKey: ['accounts', 'signal-lines', accountId],
    queryFn: () => apiFetch<AccountSignalLines>({ path: `/accounts/${accountId}/signal-lines` }),
    enabled: Boolean(accountId),
  })
}
