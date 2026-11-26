import type { CreateCommercialOutcomeInput } from '@bellum/contracts'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { i18n } from '@/i18n'
import { accountsApi } from '@/features/accounts/api'

/**
 * #2126.47/.48/.50/.51/.53/.54/.55/.60 (épopée #2787) — le ledger APPEND-ONLY
 * des outcomes commerciaux d'un compte. `GET`/`POST` seulement : aucun outcome
 * ne se met à jour ni ne se supprime (#2126.60), donc aucune mutation
 * optimiste ici — l'écran attend la réponse serveur avant d'ajouter la ligne.
 */
export const commercialOutcomesKeys = {
  list: (accountId: string) => ['accounts', accountId, 'outcomes'] as const,
}

export function useCommercialOutcomes(accountId: string) {
  const query = useQuery({
    queryKey: commercialOutcomesKeys.list(accountId),
    queryFn: () => accountsApi.listOutcomes(accountId),
    enabled: accountId.length > 0,
  })
  return { items: query.data?.items ?? [], isLoading: query.isLoading, isError: query.isError }
}

export function useRecordCommercialOutcome(accountId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: CreateCommercialOutcomeInput) => accountsApi.recordOutcome(accountId, input),
    onSuccess: () => void qc.invalidateQueries({ queryKey: commercialOutcomesKeys.list(accountId) }),
    onError: (error: Error) => toast.error(error.message || i18n.t('contacts:outcomes.recordError')),
  })
}
